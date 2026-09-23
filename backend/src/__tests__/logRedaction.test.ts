import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_CONFIG } from '../lib/logger.js';

/** Captures everything written to the stream as raw log lines. */
function captureStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

describe('Phase 9 hardening: secret redaction in logs', () => {
  it("redacts the app's Authorization header field", () => {
    const { stream, lines } = captureStream();
    const log = pino({ redact: REDACT_CONFIG }, stream);

    log.info({ req: { headers: { authorization: 'Apikey super-secret-value' } } }, 'incoming request');

    const joined = lines.join('');
    expect(joined).not.toContain('super-secret-value');
    expect(joined).toContain('[REDACTED]');
  });

  it('redacts apiKey/secret-shaped fields at any nesting level', () => {
    const { stream, lines } = captureStream();
    const log = pino({ redact: REDACT_CONFIG }, stream);

    log.info({ meta: { apiKey: 'do-not-leak-me' } }, 'test');
    log.info({ config: { secret: 'do-not-leak-secret' } }, 'test');
    log.info({ env: { SEPAY_WEBHOOK_API_KEY: 'do-not-leak-env-key' } }, 'test');

    const joined = lines.join('');
    expect(joined).not.toContain('do-not-leak-me');
    expect(joined).not.toContain('do-not-leak-secret');
    expect(joined).not.toContain('do-not-leak-env-key');
    expect((joined.match(/\[REDACTED\]/g) ?? []).length).toBe(3);
  });
});
