import { afterEach, describe, expect, it } from 'vitest';
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

describe('Phase 10.4: configurable CORS (ALLOWED_ORIGINS)', () => {
  let app: ReturnType<typeof buildApp>;
  let db: DbHandle;

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('does not send CORS headers when ALLOWED_ORIGINS is unset (safe default)', async () => {
    ({ app, db } = makeApp());
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { origin: 'https://dashboard.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reflects an explicitly allowed origin', async () => {
    ({ app, db } = makeApp({ ALLOWED_ORIGINS: 'https://dashboard.example.com' }));
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { origin: 'https://dashboard.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.example.com');
  });

  it('does not reflect an origin outside the allowlist', async () => {
    ({ app, db } = makeApp({ ALLOWED_ORIGINS: 'https://dashboard.example.com' }));
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });
});
