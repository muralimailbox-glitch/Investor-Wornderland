import { defineConfig, devices } from '@playwright/test';

// ── Prod-DB pollution guard ─────────────────────────────────────────────
// Refuse to start the suite when DATABASE_URL points at a real prod DB.
// Cleaned up 142 e2e-generated rows on 2026-04-28 — never again.
// Override with E2E_ALLOW_PROD_DB=1 if you genuinely mean it.
function ensureSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) return;
  const lower = url.toLowerCase();
  const isLocal =
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('@::1') ||
    lower.includes('host.docker.internal');
  const looksLikeTestDb = /\/\w*(test|e2e|ci|stage|staging)\w*(\?|$)/i.test(url);
  const optIn = process.env.E2E_ALLOW_PROD_DB === '1';
  if (isLocal || looksLikeTestDb || optIn) return;
  throw new Error(
    [
      '',
      'E2E SUITE REFUSED TO RUN against this DATABASE_URL.',
      'The URL does not look like a local or test database — running the',
      'suite would create real investor / lead / interaction rows in your',
      'production cockpit.',
      '',
      'Fix one of:',
      '  1. Point DATABASE_URL at localhost or a *_test database.',
      '  2. Set E2E_ALLOW_PROD_DB=1 if you genuinely mean it.',
      '',
    ].join('\n'),
  );
}
ensureSafeDatabase();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Auto-boot Next dev so `pnpm exec playwright test` can run from a clean
  // shell without a separate dev server in another tab. Reuses an existing
  // server if the operator already has `pnpm dev` running locally.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
