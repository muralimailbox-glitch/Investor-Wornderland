import { expect, test } from '@playwright/test';

// /ask is invite-gated and redirects anonymous visitors to / — it stays
// a 200 response after the redirect lands, so it's still safe to include
// here. Public routes that genuinely render anonymously: marketing
// splash, NDA intake, gated lounge shell, privacy, terms.
const PUBLIC_ROUTES = ['/', '/ask', '/nda', '/lounge', '/privacy', '/terms'];
const COCKPIT_ROUTES = ['/cockpit/login'];

for (const path of PUBLIC_ROUTES) {
  test(`public route renders: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${path} status`).toBe(200);
    await expect(page).toHaveTitle(/.+/);
    const errorsWithoutKnownNoise = errors.filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Failed to load resource/i.test(e) &&
        !/401/i.test(e) &&
        !/anonymous/i.test(e),
    );
    expect(errorsWithoutKnownNoise, `console errors on ${path}`).toEqual([]);
  });
}

for (const path of COCKPIT_ROUTES) {
  test(`cockpit route renders: ${path}`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });
}

test('landing hero is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});

test('ask route bounces anonymous visitors to the splash', async ({ page, context }) => {
  // /ask is invite-gated — anonymous request is redirected to / with a
  // ?link=expired marker. The previous assertion (anonymous textarea) was
  // valid before the gate existed and now masks the redirect contract.
  await context.clearCookies();
  await page.goto('/ask');
  expect(page.url()).toMatch(/\/(\?|$)/);
});

test('cockpit login form renders', async ({ page }) => {
  await page.goto('/cockpit/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('cockpit root redirects to login when signed out', async ({ page, context }) => {
  await context.clearCookies();
  const response = await page.goto('/cockpit');
  expect(response?.status()).toBe(200);
  expect(page.url()).toContain('/cockpit/login');
});
