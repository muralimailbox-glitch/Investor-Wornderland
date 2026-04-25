import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v))
  .pipe(z.string().url().optional());

/**
 * Environment contract. Keys grouped by the phase they must be supplied for.
 * - Always required: NODE_ENV, site URL, DB URL, AUTH secret, session cookie name.
 * - Phase 3+ (Integrations): SMTP, R2.
 * - Phase 5 (AI): ANTHROPIC_*.
 * - Phase 7 (Launch): SMTP_FROM, GOOGLE_*.
 *
 * Phase-gated keys are optional in the schema and validated at the call site
 * via `requireEnv()` — this lets the dev server boot without the full contract
 * while still preventing runtime access to an unset key.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  DATABASE_URL: z.string().url(),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL_CONCIERGE: z.string().min(1),
  ANTHROPIC_MODEL_DRAFTER: z.string().min(1),
  AI_MONTHLY_CAP_USD: z.coerce.number().int().positive().default(50),
  EMBEDDING_CACHE_DIR: optionalString,

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: boolish,
  SMTP_USER: z.string().email(),
  SMTP_PASS: optionalString,
  SMTP_FROM: z.string().email(),
  SMTP_FROM_NAME: z.string().min(1),

  IMAP_HOST: z.string().min(1),
  IMAP_PORT: z.coerce.number().int().positive(),
  IMAP_USER: z.string().email(),
  IMAP_PASS: optionalString,

  R2_ENDPOINT: optionalUrl,
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_PUBLIC_URL: optionalUrl,
  FILE_STORAGE_DRIVER: z.enum(['postgres', 'r2']).default('postgres'),
  R2_FORCE_PATH_STYLE: boolish.default(false),

  AUTH_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().min(1).default('ootaos_session'),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,

  SENTRY_DSN: optionalUrl,
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Build-phase fallbacks. Returned only when Next.js is collecting page data
 * and the real env has not been injected yet. All are placeholder values that
 * will never reach a live request — by the time a request is served, runtime
 * env validation has run against the deployed container and real values exist.
 */
const BUILD_PHASE_FALLBACKS: Env = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: 'https://build.placeholder.invalid',
  DATABASE_URL: 'postgres://build:build@localhost:5432/build',
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL_CONCIERGE: 'claude-sonnet-4-6',
  ANTHROPIC_MODEL_DRAFTER: 'claude-sonnet-4-6',
  AI_MONTHLY_CAP_USD: 50,
  EMBEDDING_CACHE_DIR: undefined,
  SMTP_HOST: 'localhost',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: 'build@placeholder.invalid',
  SMTP_PASS: undefined,
  SMTP_FROM: 'build@placeholder.invalid',
  SMTP_FROM_NAME: 'Build',
  IMAP_HOST: 'localhost',
  IMAP_PORT: 993,
  IMAP_USER: 'build@placeholder.invalid',
  IMAP_PASS: undefined,
  R2_ENDPOINT: undefined,
  R2_ACCOUNT_ID: undefined,
  R2_ACCESS_KEY_ID: undefined,
  R2_SECRET_ACCESS_KEY: undefined,
  R2_BUCKET: undefined,
  R2_PUBLIC_URL: undefined,
  FILE_STORAGE_DRIVER: 'postgres' as const,
  R2_FORCE_PATH_STYLE: false,
  AUTH_SECRET: 'a'.repeat(64),
  SESSION_COOKIE_NAME: 'ootaos_session',
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REDIRECT_URI: undefined,
  SENTRY_DSN: undefined,
};

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const message = `Invalid environment configuration:\n  ${missing}`;

  if (isBuildPhase) {
    console.warn(`[env] Build phase with missing env — using placeholder values.\n  ${missing}`);
    return BUILD_PHASE_FALLBACKS;
  }
  if (process.env.NODE_ENV === 'test') {
    console.warn(`[env] ${message}`);
    return new Proxy({} as Env, {
      get(_t, key: string) {
        throw new Error(`env.${key} accessed with invalid environment: ${message}`);
      },
    });
  }
  throw new Error(message);
}

export const env = parseEnv();

/** Read an env key that is optional in the schema but required for a specific feature. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`env.${String(key)} is required but not set`);
  }
  return value as NonNullable<Env[K]>;
}
