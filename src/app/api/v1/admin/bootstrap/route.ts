/**
 * Emergency founder re-provisioner. Hit this endpoint with the AUTH_SECRET
 * as a bearer token to force the founder user record to be (re-)created
 * with a fresh argon2 password hash from FOUNDER_EMAIL / FOUNDER_PASSWORD.
 *
 * Use this when the cockpit login fails after a deploy and you can't tell
 * whether bootstrap.ts ran. No subprocesses, no PATH lookups — just a
 * direct DB write inside the running app.
 *
 * Usage from your local terminal:
 *
 *   curl -X POST https://investors.ootaos.com/api/v1/admin/bootstrap \
 *     -H "Authorization: Bearer $AUTH_SECRET"
 *
 * Or from the browser console while on the site:
 *
 *   fetch('/api/v1/admin/bootstrap', {
 *     method: 'POST',
 *     headers: { Authorization: 'Bearer <your AUTH_SECRET>' },
 *   }).then(r => r.json()).then(console.log)
 *
 * Returns { ok: true, userId, rotated } on success, or { ok: false, error }
 * with a 4xx/5xx code otherwise.
 */
import { eq } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { provisionFounder } from '@/lib/auth/founder-provision';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:bootstrap', perMinute: 5 });

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== env.AUTH_SECRET) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const founderEmail = env.FOUNDER_EMAIL;
  const founderPassword = env.FOUNDER_PASSWORD;
  const founderFirstName = env.FOUNDER_FIRST_NAME;

  if (!founderEmail || !founderPassword) {
    return Response.json(
      { ok: false, error: 'FOUNDER_EMAIL / FOUNDER_PASSWORD not set on this service' },
      { status: 412 },
    );
  }

  // Idempotent workspace seed — re-uses the existing OotaOS workspace if any.
  const existing = await db.select().from(workspaces).where(eq(workspaces.name, 'OotaOS')).limit(1);
  const workspace =
    existing[0] ??
    (await db.insert(workspaces).values({ name: 'OotaOS', aiMonthlyCapUsd: 50 }).returning())[0];
  if (!workspace) {
    return Response.json({ ok: false, error: 'workspace_seed_failed' }, { status: 500 });
  }

  const result = await provisionFounder(db, {
    workspaceId: workspace.id,
    email: founderEmail,
    password: founderPassword,
    firstName: founderFirstName,
  });

  return Response.json({
    ok: true,
    workspaceId: workspace.id,
    userId: result.userId,
    rotated: result.rotated,
    email: founderEmail,
  });
});
