import { expect, test } from '@playwright/test';

test('root path serves the investor lounge, not the founder login', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  // Investor lounge cues
  await expect(page.getByText(/Investor Wonderland/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Investors don.+t read pitches/i })).toBeVisible();
  // OotaOS logo present
  await expect(page.locator('img[alt="OotaOS"]').first()).toBeVisible();
  // Concierge input present (the textarea inside the Ask Priya card)
  await expect(page.locator('textarea')).toBeVisible();
});

test('cockpit is gated — unauthenticated GET /cockpit redirects to /cockpit/login', async ({
  page,
}) => {
  const res = await page.goto('/cockpit');
  expect(res?.ok()).toBeTruthy();
  expect(page.url()).toMatch(/\/cockpit\/login$/);
  // Logo on the login page
  await expect(page.locator('img[alt="OotaOS"]').first()).toBeVisible();
});
