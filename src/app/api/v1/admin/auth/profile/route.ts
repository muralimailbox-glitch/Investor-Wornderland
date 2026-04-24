import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  whatsappE164: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{6,18}$/, 'whatsapp must be E.164 digits, optional leading +')
    .nullable()
    .optional(),
  publicEmail: z.string().email().max(254).nullable().optional(),
  signatureMarkdown: z.string().max(4000).nullable().optional(),
  companyName: z.string().trim().min(1).max(160).nullable().optional(),
  companyWebsite: z.string().url().max(500).nullable().optional(),
  companyAddress: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  defaultTimezone: z.string().max(80).nullable().optional(),
});

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:auth:profile:get', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      whatsappE164: users.whatsappE164,
      publicEmail: users.publicEmail,
      signatureMarkdown: users.signatureMarkdown,
      companyName: users.companyName,
      companyWebsite: users.companyWebsite,
      companyAddress: users.companyAddress,
      logoUrl: users.logoUrl,
      avatarUrl: users.avatarUrl,
      defaultTimezone: users.defaultTimezone,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new NotFoundError('user_not_found');
  return Response.json(row);
});

export const PATCH = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:auth:profile:patch', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const patch = PatchBody.parse(await req.json());

  const update: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (update as Record<string, unknown>)[k] = v;
  }

  const [row] = await db.update(users).set(update).where(eq(users.id, user.id)).returning();
  if (!row) throw new NotFoundError('user_not_found');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'auth.profile.updated',
    targetType: 'user',
    targetId: user.id,
    payload: { keys: Object.keys(patch) },
  });

  return Response.json({
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.displayName,
    whatsappE164: row.whatsappE164,
    publicEmail: row.publicEmail,
    signatureMarkdown: row.signatureMarkdown,
    companyName: row.companyName,
    companyWebsite: row.companyWebsite,
    companyAddress: row.companyAddress,
    logoUrl: row.logoUrl,
    avatarUrl: row.avatarUrl,
    defaultTimezone: row.defaultTimezone,
  });
});
