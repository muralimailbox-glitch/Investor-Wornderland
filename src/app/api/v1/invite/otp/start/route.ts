import { cookies } from 'next/headers';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';
import { issueOtp } from '@/lib/auth/otp';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'invite:otp:start', perMinute: 6 });

  const jar = await cookies();
  const linkSession = verifyInvestorLink(jar.get(INVESTOR_COOKIE)?.value);
  if (!linkSession) throw new ApiError(401, 'invalid_or_expired_link');

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'invalid_body');
  const email = parsed.data.email.trim();

  const code = await issueOtp(email);

  const branded = renderBrandedEmail({
    heading: `Hi ${linkSession.firstName} — your verification code`,
    body: `Enter this code to unlock deeper details about the round. It expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.`,
    facts: [['Code', code]],
    preFooter: 'For your security, OotaOS will never ask you to share this code.',
  });

  // Fire-and-forget so the HTTP response doesn't block on the SMTP round-trip.
  // Zoho SMTP over TLS to a Mumbai endpoint can take 4–10s on cold connections;
  // the investor sees a faster "code on the way" UI this way and the OTP is
  // already issued in the database (issueOtp above) so any retry is safe.
  // Failures are logged for observability — we don't expose SMTP errors to the
  // caller because they leak transport details and would block the UX.
  void sendMail({
    to: email,
    subject: `Your OotaOS verification code: ${code}`,
    text: branded.text,
    html: branded.html,
  }).catch((err: unknown) => {
    console.error('[otp:start] sendMail failed', {
      to: email,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return Response.json({ sent: true });
});
