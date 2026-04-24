import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  DATABASE_URL: z.string().url(),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL_CONCIERGE: z.string().min(1),
  ANTHROPIC_MODEL_DRAFTER: z.string().min(1),
  AI_MONTHLY_CAP_USD: z.coerce.number().int().positive().default(50),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: boolish,
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().email(),
  SMTP_FROM_NAME: z.string().min(1),

  IMAP_HOST: z.string().min(1),
  IMAP_PORT: z.coerce.number().int().positive(),
  IMAP_USER: z.string().email(),
  IMAP_PASS: z.string().min(1),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().min(1).default('ootaos_session'),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
});

function parseEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const message = `Invalid environment configuration:\n  ${missing}`;

  if (isBuildPhase || process.env.NODE_ENV === 'test') {
    console.warn(`[env] ${message}`);
    return new Proxy({} as z.infer<typeof EnvSchema>, {
      get(_t, key: string) {
        throw new Error(`env.${key} accessed with invalid environment: ${message}`);
      },
    });
  }
  throw new Error(message);
}

export const env = parseEnv();
export type Env = z.infer<typeof EnvSchema>;
