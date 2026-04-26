/**
 * Begin the Google OAuth dance. Returns a redirect to Google's consent screen
 * scoped to Calendar event creation. The callback route exchanges the code
 * for tokens and stores them.
 */
import { ApiError, handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCOPE = ['https://www.googleapis.com/auth/calendar.events'].join(' ');

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:google-calendar:start', perMinute: 10 });
  await requireAuth({ role: 'founder' });

  const clientId = env.GOOGLE_CLIENT_ID;
  const redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new ApiError(503, 'google_oauth_not_configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
});
