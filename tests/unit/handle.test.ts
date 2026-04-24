import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  handle,
  NotFoundError,
  toErrorResponse,
} from '@/lib/api/handle';
import { AuthError } from '@/lib/auth/guard';
import { RateLimitError } from '@/lib/security/rate-limit';

function makeReq(): Request {
  return new Request('http://localhost/test', { method: 'POST' });
}

async function body<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('handle wrapper', () => {
  it('returns the handler response when it resolves', async () => {
    const h = handle(async () => Response.json({ ok: true }));
    const res = await h(makeReq());
    expect(res.status).toBe(200);
    expect(await body<{ ok: boolean }>(res)).toEqual({ ok: true });
  });

  it('maps RateLimitError → 429 with retry headers', async () => {
    const h = handle(async () => {
      throw new RateLimitError(3000);
    });
    const res = await h(makeReq());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3');
    const bodyJson = await body<{ title: string; retryAfterMs: number }>(res);
    expect(bodyJson.title).toBe('rate_limited');
    expect(bodyJson.retryAfterMs).toBe(3000);
  });

  it('maps AuthError(no-session) → 401', async () => {
    const h = handle(async () => {
      throw new AuthError('no-session');
    });
    const res = await h(makeReq());
    expect(res.status).toBe(401);
    expect(await body<{ title: string; code: string }>(res)).toMatchObject({
      title: 'unauthorized',
      code: 'no-session',
    });
  });

  it('maps AuthError(forbidden) → 403', async () => {
    const h = handle(async () => {
      throw new AuthError('forbidden');
    });
    const res = await h(makeReq());
    expect(res.status).toBe(403);
    expect((await body<{ title: string }>(res)).title).toBe('forbidden');
  });

  it('maps ZodError → 400 with flattened errors', async () => {
    const schema = z.object({ email: z.string().email() });
    const h = handle(async () => {
      schema.parse({ email: 'nope' });
      return Response.json({});
    });
    const res = await h(makeReq());
    expect(res.status).toBe(400);
    const bodyJson = await body<{ title: string; errors: unknown }>(res);
    expect(bodyJson.title).toBe('validation_failed');
    expect(bodyJson.errors).toBeDefined();
  });

  it('maps ApiError to its custom status/code', async () => {
    const h = handle(async () => {
      throw new ApiError(418, 'im_a_teapot');
    });
    const res = await h(makeReq());
    expect(res.status).toBe(418);
    expect((await body<{ title: string }>(res)).title).toBe('im_a_teapot');
  });

  it('falls through to 500 for unknown errors', async () => {
    const h = handle(async () => {
      throw new Error('boom');
    });
    const res = await h(makeReq());
    expect(res.status).toBe(500);
  });
});

describe('error subclasses default codes', () => {
  it('ForbiddenError defaults to 403 forbidden', () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
  });

  it('NotFoundError defaults to 404 not-found', () => {
    const err = new NotFoundError();
    expect(err.status).toBe(404);
    expect(err.code).toBe('not-found');
  });

  it('BadRequestError defaults to 400 bad-request', () => {
    const err = new BadRequestError();
    expect(err.status).toBe(400);
    expect(err.code).toBe('bad-request');
  });
});

describe('toErrorResponse directly', () => {
  it('handles ZodError instance type', () => {
    const err = new ZodError([]);
    const res = toErrorResponse(err);
    expect(res.status).toBe(400);
  });
});
