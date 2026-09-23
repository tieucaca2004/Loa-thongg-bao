import Fastify from 'fastify';
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

  app.get('/health', async (_req, reply) => {
    const dbOk = checkDatabaseHealth(db);
    reply.code(dbOk ? 200 : 503);
    return {
      status: dbOk ? 'ok' : 'error',
      database: dbOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  });

  app.post('/webhooks/sepay', async (req, reply) => {
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

    const outcome = processSepayWebhook(req.body, { transactions, webhookLogs, events, log });

    if (outcome.status === 'rejected') {
      reply.code(outcome.httpStatus);
      return { success: false, error: outcome.reason };
    }

    reply.code(200);
    return { success: true, transactionId: outcome.transactionId, duplicate: outcome.duplicate };
  });

  app.get('/transactions', async (req) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.min(Number(query.limit) || 50, 200) : 50;
    return { transactions: transactions.listRecent(limit) };
  });

  return app;
}
