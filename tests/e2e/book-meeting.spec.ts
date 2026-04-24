import { expect, test } from '@playwright/test';

test.describe('Book meeting journey', () => {
  test('lounge page renders for investor (without NDA cookie shows gating UI)', async ({
    page,
  }) => {
    await page.goto('/lounge', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /data room/i })).toBeVisible();
  });

  test('lounge bundle endpoint returns 401 without NDA cookie', async ({ request }) => {
    const res = await request.get('/api/v1/lounge', { failOnStatusCode: false });
    expect(res.status()).toBe(401);
  });

  test('book meeting endpoint rejects unauthenticated POST', async ({ request }) => {
    const res = await request.post('/api/v1/book-meeting', {
      data: {
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
