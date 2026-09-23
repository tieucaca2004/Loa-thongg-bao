import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config.js';
import type { Logger } from './lib/logger.js';
import type { DbHandle } from './db/index.js';
import { checkDatabaseHealth } from './db/index.js';
import { TransactionRepository, WebhookLogRepository } from './db/transactionRepository.js';
import { PaymentEventBus } from './services/events/eventBus.js';
import { processSepayWebhook } from './services/payments/webhookProcessor.js';
import { verifySepayApiKey } from './services/sepay/auth.js';

export interface BuildAppOptions {
  config: AppConfig;
  log: Logger;
  db: DbHandle;
  events: PaymentEventBus;
}

/**
 * Builds the Fastify app. Separated from server.ts (which binds a port and
 * starts the WS server) so tests can build + inject requests without
 * opening real network sockets.
 */
export function buildApp({ config, log, db, events }: BuildAppOptions) {
  const app = Fastify({
    logger: log,
    bodyLimit: config.WEBHOOK_BODY_LIMIT_BYTES,
  });

  const transactions = new TransactionRepository(db);
  const webhookLogs = new WebhookLogRepository(db);

  // Global rate-limit plugin registration with `global: false` — it only
  // applies to routes that opt in via `config.rateLimit` (see the webhook
  // route below). /health and /transactions are intentionally unlimited.
  void app.register(rateLimit, { global: false });

  // Centralized error handler so malformed JSON bodies and unexpected
  // internal errors (e.g. a DB failure) always get a controlled,
  // structured response instead of leaking a stack trace or accidentally
  // reporting false success. Never includes header/secret values in logs.
  app.setErrorHandler((error, req, reply) => {
    // Our own application-level validation (invalid SePay payload shape,
    // bad amount, etc.) is returned as a normal 400 response from the route
    // handler, not thrown — so any error that reaches this handler with a
    // 4xx status is a framework-level parsing failure: malformed JSON,
    // unsupported/missing content-type, or an oversized body.
    const isBodyParseError = typeof error.statusCode === 'number' && error.statusCode === 400;

    if (isBodyParseError) {
      if (req.method === 'POST' && req.url.startsWith('/webhooks/sepay')) {
        webhookLogs.log({
          outcome: 'rejected_invalid',
          reason: error.message,
          rawPayload: '"<unparseable body>"',
          sourceIp: req.ip,
        });
      }
      log.warn({ sourceIp: req.ip, code: error.code }, 'rejected malformed webhook request body');
      reply.code(400);
      return { success: false, error: 'malformed request body' };
    }

    if (error.statusCode && error.statusCode < 500) {
      reply.code(error.statusCode);
      return { success: false, error: error.message };
    }

    // Unexpected/internal error: never report false success, never leak
    // internals. Full error is logged server-side only.
    log.error({ err: error.message, sourceIp: req.ip, path: req.url }, 'internal error handling request');
    reply.code(500);
    return { success: false, error: 'internal server error' };
  });

  app.get('/health', async (_req, reply) => {
    const dbOk = checkDatabaseHealth(db);
    reply.code(dbOk ? 200 : 503);
    return {
      status: dbOk ? 'ok' : 'error',
      database: dbOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  });

  // `app.after()` defers route registration until the rate-limit plugin
  // registered above has finished booting. Without this, Fastify's plugin
  // boot (avvio) is deferred, so the rate-limit plugin's `onRoute` hook
  // would not yet exist at the moment `.post()` runs synchronously below,
  // and the per-route `config.rateLimit` would silently never take effect.
  app.after(() => {
    app.post(
      '/webhooks/sepay',
      {
        config: {
          rateLimit: {
            max: config.RATE_LIMIT_MAX,
            timeWindow: config.RATE_LIMIT_WINDOW_MS,
          },
        },
      },
      async (req, reply) => {
        const authHeader = req.headers['authorization'];
        if (!verifySepayApiKey(authHeader, config.SEPAY_WEBHOOK_API_KEY)) {
          webhookLogs.log({
            outcome: 'rejected_auth',
            reason: 'invalid or missing Authorization header',
            rawPayload: JSON.stringify(req.body ?? null),
            sourceIp: req.ip,
          });
          log.warn({ sourceIp: req.ip }, 'rejected sepay webhook: authentication failed');
          reply.code(401);
          return { success: false, error: 'unauthorized' };
        }

        // Any unexpected throw here (e.g. the database is unavailable) must
        // never be reported as success — let the centralized error handler
        // above turn it into a controlled 500.
        const outcome = processSepayWebhook(req.body, { transactions, webhookLogs, events, log });

        if (outcome.status === 'rejected') {
          reply.code(outcome.httpStatus);
          return { success: false, error: outcome.reason };
        }

        reply.code(200);
        return { success: true, transactionId: outcome.transactionId, duplicate: outcome.duplicate };
      }
    );
  });

  app.get('/transactions', async (req) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.min(Number(query.limit) || 50, 200) : 50;
    return { transactions: transactions.listRecent(limit) };
  });

  return app;
}
