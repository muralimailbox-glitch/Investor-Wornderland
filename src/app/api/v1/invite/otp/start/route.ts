import { cookies } from 'next/headers';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';
import { issueOtp } from '@/lib/auth/otp';
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

  await sendMail({
    to: email,
    subject: `Your OotaOS verification code: ${code}`,
    text: [
      `Hi ${linkSession.firstName},`,
      '',
      `Your OotaOS verification code is: ${code}`,
      '',
      'Enter this code to unlock deeper details about the round. It expires in 10 minutes.',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— OotaOS',
    ].join('\n'),
    html: `<!doctype html>
<html><body style="font-family: -apple-system, Inter, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111">
  <h1 style="font-size: 18px; letter-spacing: -0.01em; margin: 0 0 16px">Hi ${linkSession.firstName} — your verification code</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #333">Enter this code to unlock deeper details. It expires in 10 minutes.</p>
  <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; background: linear-gradient(135deg,#8b5cf6,#ec4899); -webkit-background-clip: text; color: transparent; margin: 24px 0">${code}</p>
  <p style="font-size: 12px; color: #666">If you did not request this, ignore this email.</p>
</body></html>`,
  });

  return Response.json({ sent: true });
});
