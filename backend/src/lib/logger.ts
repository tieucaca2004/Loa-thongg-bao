import pino from 'pino';
import type { AppConfig } from '../config.js';

/**
 * Paths pino redacts before any log line is written, regardless of level or
 * transport. Exported so tests can verify redaction directly against a
 * plain pino instance (see src/__tests__/logRedaction.test.ts) without
 * depending on transport internals (pino-pretty runs off-thread and isn't
 * synchronously observable in tests).
 */
export const REDACT_CONFIG = {
  paths: [
    'req.headers.authorization',
    '*.headers.authorization',
    '*.apiKey',
    '*.api_key',
    '*.secret',
    '*.SEPAY_WEBHOOK_API_KEY',
  ],
  censor: '[REDACTED]',
};

/**
 * Structured logger. Callers MUST NOT pass secret values (API keys, webhook
 * secrets) into log fields — see docs/SECURITY.md.
 */
export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
    redact: REDACT_CONFIG,
  });
}

export type Logger = ReturnType<typeof createLogger>;
