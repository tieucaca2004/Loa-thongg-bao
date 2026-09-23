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
