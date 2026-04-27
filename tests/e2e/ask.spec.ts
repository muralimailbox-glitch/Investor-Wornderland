import { expect, test } from '@playwright/test';

test.describe('Concierge ask journey', () => {
  test('anonymous visitor lands on /ask and is bounced to the marketing splash', async ({
    page,
    context,
  }) => {
    // /ask is invite-gated UX (rule #8): without a magic-link cookie the
    // page redirects to / with a ?link=expired hint. The previous test
    // assumed an anonymous chat surface, which no longer exists.
    await context.clearCookies();
    const response = await page.goto('/ask', { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBeTruthy();
    expect(page.url()).toMatch(/\/(\?|$)/);
    expect(new URL(page.url()).searchParams.get('link')).toBe('expired');
  });

  test('anonymous POST to /api/v1/ask returns 401', async ({ request }) => {
    const res = await request.post('/api/v1/ask', {
      data: { question: 'Tell me about traction', sessionId: 'test-session-ask' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('anonymous POST to /api/v1/concierge-feedback returns 401', async ({ request }) => {
    const res = await request.post('/api/v1/concierge-feedback', {
      data: {
        sessionId: 'test-session-fb',
        question: 'Tell me about traction',
        answer: 'Sample answer',
        rating: 'up',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });
});
