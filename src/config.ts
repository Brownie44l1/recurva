import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://recurva:recurva@localhost:5432/recurva'),
  DATABASE_SSL: z.preprocess((val) => {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return val;
  }, z.coerce.boolean()).default(false),
  DB_MAX_CONNECTIONS: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT: z.coerce.number().default(20),
  JWT_SECRET: z.string().default('dev-secret-do-not-use-in-prod'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  PORTAL_JWT_EXPIRES_IN: z.string().default('1h'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NOMBA_ENV: z.enum(['test', 'live']).default('test'),
  NOMBA_PARENT_ACCOUNT_ID: z.string().default(''),
  NOMBA_SUB_ACCOUNT_ID: z.string().default(''),
  NOMBA_TEST_CLIENT_ID: z.string().default(''),
  NOMBA_TEST_PRIVATE_KEY: z.string().default(''),
  NOMBA_LIVE_CLIENT_ID: z.string().default(''),
  NOMBA_LIVE_PRIVATE_KEY: z.string().default(''),
  NOMBA_WEBHOOK_SECRET: z.string().default(process.env.NOMBA_INBOUND_WEBHOOK_SECRET || ''),
  ENCRYPTION_KEY: z.string().default(''),
  BILLING_CRON: z.string().default('0 6 * * *'),
  DUNNING_CRON: z.string().default('0 * * * *'),
  WEBHOOK_RETRY_CRON: z.string().default('*/15 * * * *'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
