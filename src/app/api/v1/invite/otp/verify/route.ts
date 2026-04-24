import { cookies } from 'next/headers';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';
import { verifyOtp } from '@/lib/auth/otp';
import { db } from '@/lib/db/client';
import { interactions, investors } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/, 'six_digit_code_required'),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'invite:otp:verify', perMinute: 10 });

  const jar = await cookies();
  const linkSession = verifyInvestorLink(jar.get(INVESTOR_COOKIE)?.value);
  if (!linkSession) throw new ApiError(401, 'invalid_or_expired_link');

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'invalid_body');

  const providedEmail = parsed.data.email.trim().toLowerCase();
  const code = parsed.data.code;

  const ok = await verifyOtp(providedEmail, code);
  if (!ok) throw new ApiError(400, 'invalid_or_expired_otp');

  const [current] = await db
    .select({ id: investors.id, email: investors.email })
    .from(investors)
    .where(
      and(
        eq(investors.workspaceId, linkSession.workspaceId),
        eq(investors.id, linkSession.investorId),
      ),
    )
    .limit(1);

  if (!current) throw new ApiError(404, 'investor_not_found');

  const existingEmail = current.email.toLowerCase();
  let emailUpdated = false;

  if (existingEmail !== providedEmail) {
    // Reject if another investor in the same workspace already uses this email.
    const collision = await db
      .select({ id: investors.id })
      .from(investors)
      .where(
        and(
          eq(investors.workspaceId, linkSession.workspaceId),
          eq(investors.email, providedEmail),
          ne(investors.id, current.id),
        ),
      )
      .limit(1);
    if (collision[0]) throw new ApiError(409, 'email_already_linked_to_another_investor');

    await db
      .update(investors)
      .set({ email: providedEmail, emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(investors.id, current.id));
    emailUpdated = true;
  } else {
    await db
      .update(investors)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(investors.id, current.id));
  }

  await db
    .insert(interactions)
    .values({
      workspaceId: linkSession.workspaceId,
      investorId: current.id,
      kind: 'email_verified',
      payload: { emailUpdated, email: providedEmail },
    })
    .catch((e) => {
      console.warn('[invite/otp/verify] interaction log failed', e);
    });

  return Response.json({ ok: true, emailVerified: true, emailUpdated });
});
