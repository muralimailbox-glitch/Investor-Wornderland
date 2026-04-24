import { ZodError } from 'zod';

import { AuthError } from '@/lib/auth/guard';
import { RateLimitError } from '@/lib/security/rate-limit';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(code = 'forbidden') {
    super(403, code);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(code = 'not-found') {
    super(404, code);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends ApiError {
  constructor(code = 'bad-request') {
    super(400, code);
    this.name = 'BadRequestError';
  }
}

type Handler = (req: Request) => Promise<Response>;

export function handle(handler: Handler): Handler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

function problemJson(
  status: number,
  title: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  const body = {
    type: `about:blank`,
    title,
    status,
    ...extra,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...headers,
    },
  });
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof RateLimitError) {
    return problemJson(
      429,
      'rate_limited',
      { retryAfterMs: err.retryAfterMs },
      { 'Retry-After': Math.ceil(err.retryAfterMs / 1000).toString() },
    );
  }
  if (err instanceof AuthError) {
    if (err.code === 'forbidden') return problemJson(403, 'forbidden');
    return problemJson(401, 'unauthorized', { code: err.code });
  }
  if (err instanceof ZodError) {
    return problemJson(400, 'validation_failed', { errors: err.flatten() });
  }
  if (err instanceof ApiError) {
    return problemJson(err.status, err.code);
  }
  console.error('[api] unhandled error:', err);
  return problemJson(500, 'internal_error');
}
