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
  // OTP throttle bubbles up as 429 with a structured reason so the client
  // can render "too many codes — wait an hour" vs "too many bad attempts".
  if (
    err instanceof Error &&
    err.name === 'OtpThrottleError' &&
    'reason' in err &&
    typeof (err as { reason: unknown }).reason === 'string'
  ) {
    const reason = (err as { reason: string }).reason;
    return problemJson(429, `otp_${reason}`, { reason }, { 'Retry-After': '3600' });
  }
  if (err instanceof AuthError) {
    if (err.code === 'forbidden') return problemJson(403, 'forbidden');
    return problemJson(401, 'unauthorized', { code: err.code });
  }
  if (err instanceof ZodError) {
    return problemJson(400, 'validation_failed', { errors: err.flatten() });
  }
  if (err instanceof ApiError) {
    // When DEBUG_API_ERRORS=1, surface the contextual message so callers see
    // *which* recipient or stage broke instead of just the bare error code.
    if (process.env.DEBUG_API_ERRORS === '1' && err.message && err.message !== err.code) {
      return problemJson(err.status, err.code, { detail: err.message });
    }
    return problemJson(err.status, err.code);
  }
  console.error('[api] unhandled error:', err);
  // Admin routes always require an authenticated founder; surfacing the
  // real error message to the caller is fine and saves the Railway-logs
  // round-trip on every 500. Stack head is gated on DEBUG_API_ERRORS=1
  // since it can be noisier.
  if (err instanceof Error) {
    const body: Record<string, unknown> = { detail: err.message };
    if (process.env.DEBUG_API_ERRORS === '1') {
      body.stackHead = err.stack?.split('\n').slice(0, 4).join('\n') ?? null;
    }
    return problemJson(500, 'internal_error', body);
  }
  return problemJson(500, 'internal_error');
}
