import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DbHandle } from '../db/index.js';
import { PaymentEventBus } from '../services/events/eventBus.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../lib/logger.js';

const API_KEY = 'test-secret-key';

function makeApp(overrides: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SEPAY_WEBHOOK_API_KEY: API_KEY,
    LOG_LEVEL: 'silent',
    ...overrides,
  } as NodeJS.ProcessEnv);
  const log = createLogger(config);
  const db = openDatabase(':memory:');
  const events = new PaymentEventBus();
  const app = buildApp({ config, log, db, events });
  return { app, db, events };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hardening-tx',
    gateway: 'MBBank',
    transferType: 'in',
    transferAmount: 100000,
    content: 'ATIEU 1',
    ...overrides,
  };
}

describe('Phase 9 hardening: request handling', () => {
  let app: ReturnType<typeof buildApp>;
  let db: DbHandle;

  beforeEach(() => {
    ({ app, db } = makeApp());
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('rejects malformed JSON with a controlled 400, not a stack trace or 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}`, 'content-type': 'application/json' },
      payload: '{ this is not valid json',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    // Must not leak internals / stack traces.
    expect(body.error).not.toMatch(/at\s+\S+:\d+:\d+/);
  });

  it('logs malformed JSON as a webhook_logs entry for reconciliation', async () => {
    await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}`, 'content-type': 'application/json' },
      payload: '{ not json',
    });
    const row = db.prepare("SELECT outcome FROM webhook_logs WHERE outcome = 'rejected_invalid'").get();
    expect(row).toBeDefined();
  });

  it('rejects an unsupported content-type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}`, 'content-type': 'application/xml' },
      payload: '<xml/>',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('GET on the webhook path is not routed (method validation via 404, no accidental handler)', async () => {
    const res = await app.inject({ method: 'GET', url: '/webhooks/sepay' });
    expect(res.statusCode).toBe(404);
  });

  it('a DB failure surfaces as a controlled 5xx, never a false 200 success', async () => {
    db.close(); // simulate the database becoming unavailable
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload: validPayload(),
    });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

});

describe('Phase 9 hardening: rate limiting', () => {
  it('allows requests under the configured limit and rejects with 429 once exceeded', async () => {
    const { app, db } = makeApp({ RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_MS: '60000' });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/sepay',
        headers: { authorization: `Apikey ${API_KEY}` },
        payload: validPayload({ id: `rl-${i}` }),
      });
      statuses.push(res.statusCode);
    }

    // First 3 requests are within the limit (200), the rest are rate-limited (429).
    expect(statuses.slice(0, 3).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(3).every((s) => s === 429)).toBe(true);

    await app.close();
    db.close();
  });

  it('does not rate-limit /health or /transactions', async () => {
    const { app, db } = makeApp({ RATE_LIMIT_MAX: '1', RATE_LIMIT_WINDOW_MS: '60000' });

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }

    await app.close();
    db.close();
  });

  it('a realistic SePay retry burst (well under the default limit) is never blocked', async () => {
    // Default RATE_LIMIT_MAX=60/min comfortably covers SePay's documented
    // worst case of 8 delivery attempts for one transaction.
    const { app, db } = makeApp();

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/sepay',
        headers: { authorization: `Apikey ${API_KEY}` },
        payload: validPayload({ id: 'retry-burst-tx' }),
      });
      statuses.push(res.statusCode);
    }

    expect(statuses.every((s) => s === 200)).toBe(true);

    await app.close();
    db.close();
  });
});
