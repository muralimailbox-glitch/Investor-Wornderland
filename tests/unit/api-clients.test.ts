import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { streamAsk } from '@/lib/api/ask';
import { fetchLoungeBundle } from '@/lib/api/lounge';
import { initiateNda, signNda, verifyNdaOtp } from '@/lib/api/nda';

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamAsk', () => {
  it('yields meta, delta, done frames parsed from SSE', async () => {
    const body = sseBody([
      'event: meta\ndata: {"sessionId":"s-1"}\n\n',
      'event: delta\ndata: {"text":"Hello "}\n\n',
      'event: delta\ndata: {"text":"world"}\n\n',
      'event: done\ndata: {"citations":[]}\n\n',
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      ),
    );

    const frames: unknown[] = [];
    for await (const frame of streamAsk({ question: 'q', sessionId: 's-1' })) {
      frames.push(frame);
    }

    expect(frames).toHaveLength(4);
    expect((frames[0] as { event: string }).event).toBe('meta');
    expect((frames[1] as { event: string; text: string }).text).toBe('Hello ');
    expect((frames[2] as { text: string }).text).toBe('world');
    expect((frames[3] as { event: string }).event).toBe('done');
  });

  it('throws when /api/v1/ask returns non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const gen = streamAsk({ question: 'q', sessionId: 's-1' });
    await expect(gen.next()).rejects.toThrow(/ask_failed_500/);
  });

  it('skips malformed data blocks without crashing', async () => {
    const body = sseBody([
      'event: delta\ndata: not-json\n\n',
      'event: done\ndata: {"citations":[]}\n\n',
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const frames: unknown[] = [];
    for await (const frame of streamAsk({ question: 'q', sessionId: 's' })) {
      frames.push(frame);
    }
    expect(frames).toHaveLength(1);
    expect((frames[0] as { event: string }).event).toBe('done');
  });
});

describe('NDA client wrappers', () => {
  it('initiateNda POSTs JSON and returns the result', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ signingToken: 'tok-1', expiresInSeconds: 600 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await initiateNda({
      email: 'a@b.co',
      firstName: 'A',
      lastName: 'B',
      firmName: 'Firm',
      title: 'Partner',
    });

    expect(result).toEqual({ signingToken: 'tok-1', expiresInSeconds: 600 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/nda/initiate',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    const init = call[1];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('verifyNdaOtp returns verified=true on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ verified: true })),
    );
    const result = await verifyNdaOtp({ signingToken: 't', otp: '123456' });
    expect(result.verified).toBe(true);
  });

  it('signNda returns ndaId and signedAt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ndaId: 'nda-42', signedAt: '2026-04-24T10:00:00Z' })),
    );
    const result = await signNda({
      signingToken: 't',
      signerName: 'A B',
      signerTitle: 'Partner',
      signerFirm: 'Firm',
      acceptTerms: true,
    });
    expect(result.ndaId).toBe('nda-42');
    expect(result.signedAt).toBe('2026-04-24T10:00:00Z');
  });

  it('throws when NDA endpoint returns a problem+json body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ title: 'otp_invalid' }), { status: 400 })),
    );
    await expect(verifyNdaOtp({ signingToken: 't', otp: '111111' })).rejects.toThrow(/otp_invalid/);
  });

  it('throws with the status code when JSON body is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 429 })),
    );
    await expect(verifyNdaOtp({ signingToken: 't', otp: '111111' })).rejects.toThrow(/429/);
  });
});

describe('fetchLoungeBundle', () => {
  it('GETs /api/v1/lounge with credentials included and returns the bundle', async () => {
    const bundle = {
      investorName: 'x@y.co',
      documents: [],
      suggestedSlots: [],
      signedAt: '2026-04-24T10:00:00Z',
    };
    const fetchMock = vi.fn(async () => Response.json(bundle));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLoungeBundle();
    expect(result).toEqual(bundle);
    const call = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    const init = call[1];
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('throws on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ title: 'nda_required' }), { status: 401 })),
    );
    await expect(fetchLoungeBundle()).rejects.toThrow(/nda_required/);
  });
});
