import pino from 'pino';
import type { AppConfig } from '../config.js';

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
    redact: {
      paths: [
        'req.headers.authorization',
        '*.headers.authorization',
        '*.apiKey',
        '*.api_key',
        '*.secret',
        '*.SEPAY_WEBHOOK_API_KEY',
      ],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
