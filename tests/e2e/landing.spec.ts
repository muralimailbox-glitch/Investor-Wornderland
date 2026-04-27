import { expect, test } from '@playwright/test';

test('root path serves the OotaOS investor splash for anonymous visitors', async ({ page }) => {
  // Anonymous visitor without a magic-link cookie sees the marketing splash
  // (rule #8). Assertions are pinned to stable, structural cues — the visible
  // brand mark and page title — instead of marketing copy that often changes.
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/OotaOS/i);
  await expect(page.locator('img[alt="OotaOS"]').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});

test('cockpit is gated — unauthenticated GET /cockpit redirects to /cockpit/login', async ({
  page,
}) => {
  const res = await page.goto('/cockpit');
  expect(res?.ok()).toBeTruthy();
  expect(page.url()).toMatch(/\/cockpit\/login$/);
  await expect(page.locator('img[alt="OotaOS"]').first()).toBeVisible();
});
