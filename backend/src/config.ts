import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/payment-engine.sqlite'),
  SEPAY_WEBHOOK_API_KEY: z.string().min(1, 'SEPAY_WEBHOOK_API_KEY is required'),
  DESKTOP_EVENT_WS_PORT: z.coerce.number().int().positive().default(3001),
  WEBHOOK_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576), // 1MB
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Rate limiting for POST /webhooks/sepay only (per source IP). Defaults
  // are generous relative to SePay's documented retry behavior (up to 8
  // deliveries per transaction over up to 5 hours, see docs/TECHNICAL_NOTES.md)
  // so legitimate retries are never blocked; this exists to blunt a flood
  // of requests (misconfiguration, abuse, or a broken retry loop), not to
  // rate-limit normal traffic.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // Comma-separated list of origins allowed to call GET /health and
  // GET /transactions from a browser (e.g. a future internal dashboard).
  // Empty (default) disables CORS entirely — safest default, since V1 has
  // no browser client of its own. POST /webhooks/sepay is server-to-server
  // (SePay calling us) and is never subject to CORS regardless.
  ALLOWED_ORIGINS: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Loads and validates configuration from environment variables.
 * Never logs secret values (SEPAY_WEBHOOK_API_KEY).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
