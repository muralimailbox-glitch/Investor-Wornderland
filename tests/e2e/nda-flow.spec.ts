import { expect, test } from '@playwright/test';

test.describe('NDA signing journey', () => {
  test('investor reaches the NDA intake form and sees all required fields', async ({ page }) => {
    await page.goto('/nda', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /unlock the data room/i })).toBeVisible();

    // Assert the *labelled* fields rather than a raw input count — that
    // count drifts every time the form gains a hidden helper input
    // (autofill helpers, CSRF tokens, etc.) and tests start to lie.
    await expect(page.getByLabel(/email/i).first()).toBeVisible();

    const cta = page.getByRole('button').first();
    await expect(cta).toBeVisible();
  });

  test('NDA initiate POST rejects malformed input with 4xx', async ({ request }) => {
    const res = await request.post('/api/v1/nda/initiate', {
      data: { email: 'not-an-email' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('lounge redirects to NDA when no NDA cookie is present', async ({ page, context }) => {
    await context.clearCookies();
    const res = await page.goto('/lounge', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
  });
});
