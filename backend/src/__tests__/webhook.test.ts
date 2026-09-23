import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DbHandle } from '../db/index.js';
import { PaymentEventBus, type PaymentReceivedEvent } from '../services/events/eventBus.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../lib/logger.js';

const API_KEY = 'test-secret-key';

function makeApp() {
  const config = loadConfig({
    NODE_ENV: 'test',
    SEPAY_WEBHOOK_API_KEY: API_KEY,
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);
  const log = createLogger(config);
  const db = openDatabase(':memory:');
  const events = new PaymentEventBus();
  const app = buildApp({ config, log, db, events });
  return { app, db, events };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 100001,
    gateway: 'MBBank',
    transactionDate: '2026-09-23 13:42:10',
    accountNumber: '0123456789',
    code: null,
    content: 'ATIEU 1234',
    transferType: 'in',
    transferAmount: 200000,
    referenceCode: 'FT26266123456',
    ...overrides,
  };
}

describe('POST /webhooks/sepay', () => {
  let app: ReturnType<typeof buildApp>;
  let db: DbHandle;
  let events: PaymentEventBus;

  beforeEach(() => {
    ({ app, db, events } = makeApp());
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('accepts a valid transaction and stores it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload: validPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.duplicate).toBe(false);

    const row = db.prepare('SELECT * FROM transactions WHERE transaction_id = ?').get('100001') as
      | { amount: number; gateway: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.amount).toBe(200000);
    expect(row?.gateway).toBe('MBBank');
  });

  it('rejects requests with an invalid Authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: 'Apikey wrong-key' },
      payload: validPayload(),
    });
    expect(res.statusCode).toBe(401);
    expect(db.prepare('SELECT COUNT(*) as c FROM transactions').get()).toEqual({ c: 0 });
  });

  it('rejects requests with a missing Authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      payload: validPayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects payloads missing the transaction id', async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).id;
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects zero amount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload: validPayload({ transferAmount: 0 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects negative amount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload: validPayload({ transferAmount: -500 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid transaction type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}` },
      payload: validPayload({ transferType: 'sideways' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed payload (not an object)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/sepay',
      headers: { authorization: `Apikey ${API_KEY}`, 'content-type': 'application/json' },
      payload: '"just a string"',
    });
    expect(res.statusCode).toBe(400);
  });

  it('is idempotent: the same transaction sent 10 times results in exactly 1 row and 1 event', async () => {
    const received: PaymentReceivedEvent[] = [];
    events.subscribe((e) => received.push(e));

    const payload = validPayload({ id: 'dup-tx-1' });
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/sepay',
        headers: { authorization: `Apikey ${API_KEY}` },
        payload,
      });
      expect(res.statusCode).toBe(200);
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
    expect(count.c).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0].transactionId).toBe('dup-tx-1');
  });
});

describe('GET /health', () => {
  it('reports ok with a working database', async () => {
    const { app, db } = makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    await app.close();
    db.close();
  });
});
