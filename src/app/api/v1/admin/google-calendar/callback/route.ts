/**
 * Google OAuth callback. Receives the authorization code, swaps it for an
 * access+refresh token pair, and upserts into google_oauth_tokens.
 * Redirects the founder back to /cockpit/settings on success.
 */
import { and, eq } from 'drizzle-orm';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { googleOauthTokens } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GET = handle(async (req) => {
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) throw new ApiError(400, 'missing_code');

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ApiError(503, 'google_oauth_not_configured');
  }

  const tokRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokRes.ok) {
    const txt = await tokRes.text().catch(() => '');
    throw new ApiError(502, `google_token_exchange_failed: ${tokRes.status} ${txt.slice(0, 200)}`);
  }

  const j = (await tokRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!j.access_token || !j.expires_in) {
    throw new ApiError(502, 'google_token_response_missing_fields');
  }
  const expiresAt = new Date(Date.now() + j.expires_in * 1000 - 60 * 1000);

  // Upsert
  const [existing] = await db
    .select({ id: googleOauthTokens.id })
    .from(googleOauthTokens)
    .where(
      and(
        eq(googleOauthTokens.workspaceId, user.workspaceId),
        eq(googleOauthTokens.userId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(googleOauthTokens)
      .set({
        accessToken: j.access_token,
        ...(j.refresh_token ? { refreshToken: j.refresh_token } : {}),
        scope: j.scope ?? '',
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(googleOauthTokens.id, existing.id));
  } else {
    await db.insert(googleOauthTokens).values({
      workspaceId: user.workspaceId,
      userId: user.id,
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? null,
      scope: j.scope ?? '',
      expiresAt,
    });
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'google_calendar.connected',
    targetType: 'user',
    targetId: user.id,
    payload: { scope: j.scope ?? '' },
  });

  return Response.redirect(`${env.NEXT_PUBLIC_SITE_URL}/cockpit/settings?google=connected`, 302);
});
