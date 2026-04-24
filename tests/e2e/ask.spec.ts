import { expect, test } from '@playwright/test';

test.describe('Concierge ask journey', () => {
  test('investor lands on /ask and can submit a question', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/ask', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /ask priya/i })).toBeVisible();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.fill('What is your traction so far?');

    const submitButton = page.getByRole('button', { name: /ask|send/i }).first();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    const ndaCta = page.getByRole('link', { name: /sign nda/i });
    await expect(ndaCta).toBeVisible();
    expect(await ndaCta.getAttribute('href')).toBe('/nda');

    const noisy = errors.filter((e) => !/favicon|Failed to load resource|401/i.test(e));
    expect(noisy, 'no console errors on /ask').toEqual([]);
  });
});
