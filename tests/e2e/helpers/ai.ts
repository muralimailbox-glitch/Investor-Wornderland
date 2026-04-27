import type { Page } from '@playwright/test';

function sse(events: Array<{ event: string; data: unknown }>) {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

export async function mockAskSuccess(
  page: Page,
  opts: {
    answer?: string;
    citations?: Array<{ section: string; version: string }>;
  } = {},
) {
  const answer = opts.answer ?? 'OotaOS is growing well and this is a mocked answer.';
  const chunks = answer.match(/.{1,24}/g) ?? [answer];

  await page.route('**/api/v1/ask', async (route) => {
    const body = sse([
      {
        event: 'meta',
        data: {
          model: 'mock-model',
          citations: opts.citations ?? [],
          gate: { needsEmailVerify: false, needsNda: false, topics: [] },
        },
      },
      ...chunks.map((text) => ({ event: 'delta', data: { text } })),
      { event: 'done', data: { ok: true } },
    ]);

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    });
  });
}

export async function mockAskGate(page: Page) {
  await page.route('**/api/v1/ask', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse([
        {
          event: 'meta',
          data: {
            model: 'mock-model',
            citations: [],
            gate: { needsEmailVerify: false, needsNda: true, topics: ['financials'] },
          },
        },
        { event: 'delta', data: { text: 'Please sign the NDA to unlock this answer.' } },
        { event: 'done', data: { ok: true } },
      ]),
    });
  });
}

export async function mockAskFailure(page: Page, message = 'concierge_unavailable') {
  await page.route('**/api/v1/ask', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse([
        { event: 'error', data: { message } },
        { event: 'done', data: { ok: false } },
      ]),
    });
  });
}
