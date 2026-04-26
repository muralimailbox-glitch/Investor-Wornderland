/**
 * Investor self-edit. After signing the NDA an investor can correct the
 * name / firm / title we have on file — useful when the founder issued
 * a magic link with a placeholder, or when they joined a different fund
 * since we last spoke. Only fields the investor knows about themselves
 * are mutable: PII, not stage / warmth / internal notes.
 */
import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { firms, investors, leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  firmName: z.string().min(1).max(160),
});

export const GET = handle(async () => {
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const [row] = await db
    .select({
      firstName: investors.firstName,
      lastName: investors.lastName,
      title: investors.title,
      email: investors.email,
      firmName: firms.name,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(eq(leads.id, session.leadId))
    .limit(1);
  if (!row) throw new ApiError(404, 'lead_not_found');

  return Response.json({
    firstName: row.firstName,
    lastName: row.lastName,
    title: row.title,
    email: row.email,
    firmName: row.firmName,
  });
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'lounge:profile', perMinute: 6 });

  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const input = Body.parse(await req.json());

  const [leadRow] = await db
    .select({
      workspaceId: leads.workspaceId,
      investorId: leads.investorId,
      firmId: investors.firmId,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .where(eq(leads.id, session.leadId))
    .limit(1);
  if (!leadRow) throw new ApiError(404, 'lead_not_found');

  // Resolve target firm: reuse if already exists by name (case-insensitive).
  const desiredFirmName = input.firmName.trim();
  const [matchingFirm] = await db
    .select({ id: firms.id })
    .from(firms)
    .where(
      and(
        eq(firms.workspaceId, leadRow.workspaceId),
        sql`lower(${firms.name}) = ${desiredFirmName.toLowerCase()}`,
      ),
    )
    .limit(1);

  let targetFirmId = matchingFirm?.id ?? null;
  if (!targetFirmId) {
    const [created] = await db
      .insert(firms)
      .values({
        workspaceId: leadRow.workspaceId,
        name: desiredFirmName,
        firmType: 'angel',
      })
      .returning();
    targetFirmId = created?.id ?? leadRow.firmId;
  }

  await db
    .update(investors)
    .set({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      title: input.title.trim(),
      firmId: targetFirmId ?? leadRow.firmId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(investors.workspaceId, leadRow.workspaceId), eq(investors.id, leadRow.investorId)),
    );

  await audit({
    workspaceId: leadRow.workspaceId,
    actorUserId: leadRow.investorId,
    action: 'investor.self_edit',
    targetType: 'investor',
    targetId: leadRow.investorId,
    payload: {
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      firmName: desiredFirmName,
    },
  });

  return Response.json({ ok: true });
});
