/**
 * NDA renewal warning. The mutual NDA term is 2 years from signedAt.
 * 60 days before expiry, send a single bundled email to the founder
 * listing every NDA hitting the 22-month mark. Idempotent — once a
 * `nda_expiry_notified` note interaction is on the lead, we skip.
 */
import { and, asc, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { firms, interactions, investors, leads, ndas, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type NdaExpiryResult = {
  scanned: number;
  notified: number;
};

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const WARN_WINDOW_DAYS = 60;

export async function runNdaExpiryWarnings(): Promise<NdaExpiryResult> {
  const result: NdaExpiryResult = { scanned: 0, notified: 0 };

  const now = new Date();
  // Trigger when signedAt < (now - (2 years - 60 days))
  const warnAfterSigned = new Date(now.getTime() - (TWO_YEARS_MS - WARN_WINDOW_DAYS * 86_400_000));

  const candidates = await db
    .select({
      ndaId: ndas.id,
      workspaceId: ndas.workspaceId,
      leadId: ndas.leadId,
      signedAt: ndas.signedAt,
      signerName: ndas.signerName,
      signerEmail: ndas.signerEmail,
      signerFirm: ndas.signerFirm,
      revokedAt: ndas.revokedAt,
      investorFirstName: investors.firstName,
      firmName: firms.name,
      alreadyNotified: sql<boolean>`EXISTS (
        SELECT 1 FROM ${interactions} i
        WHERE i.workspace_id = ${ndas.workspaceId}
          AND i.lead_id = ${ndas.leadId}
          AND i.kind = 'note'
          AND i.payload->>'kind' = 'nda_expiry_notified'
          AND i.payload->>'ndaId' = ${ndas.id}::text
      )`,
    })
    .from(ndas)
    .innerJoin(leads, eq(leads.id, ndas.leadId))
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(lte(ndas.signedAt, warnAfterSigned)))
    .orderBy(asc(ndas.signedAt));

  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // Bundle by workspace.
  const byWorkspace = new Map<string, typeof candidates>();
  for (const r of candidates) {
    if (r.revokedAt) continue;
    if (r.alreadyNotified) continue;
    const arr = byWorkspace.get(r.workspaceId) ?? [];
    arr.push(r);
    byWorkspace.set(r.workspaceId, arr);
  }

  for (const [workspaceId, items] of byWorkspace) {
    if (items.length === 0) continue;

    const [founder] = await db
      .select({ email: users.email, firstName: users.displayName })
      .from(users)
      .where(and(eq(users.workspaceId, workspaceId), eq(users.role, 'founder')))
      .limit(1);
    const founderEmail = founder?.email ?? env.SMTP_FROM;

    const facts: Array<[string, string]> = items.slice(0, 15).map((r) => {
      const expiresAt = new Date(r.signedAt.getTime() + TWO_YEARS_MS);
      return [
        `${r.signerName} (${r.signerFirm})`,
        `Signed ${r.signedAt.toLocaleDateString()} · expires ${expiresAt.toLocaleDateString()}`,
      ];
    });

    const email = renderBrandedEmail({
      heading: `${items.length} NDA${items.length === 1 ? ' is' : 's are'} approaching the 2-year mark`,
      body:
        `These NDAs were signed almost two years ago and the confidentiality term is about to lapse. ` +
        `Decide per investor: extend the relationship with a renewal, or let the term run out and remove them from the data room.`,
      facts,
      cta: [
        { label: 'Open Diligence Room', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/documents` },
      ],
      preFooter:
        'You will only get this email once per NDA — we mark each as notified after sending.',
    });

    try {
      await sendMail({
        to: founderEmail,
        subject: `OotaOS — ${items.length} NDA${items.length === 1 ? '' : 's'} need renewal review`,
        text: email.text,
        html: email.html,
      });
      // Mark each as notified so we don't repeat tomorrow.
      for (const r of items) {
        await interactionsRepo
          .record({
            workspaceId: r.workspaceId,
            leadId: r.leadId,
            kind: 'note',
            payload: {
              kind: 'nda_expiry_notified',
              ndaId: r.ndaId,
              signedAt: r.signedAt.toISOString(),
            },
          })
          .catch(() => {});
        result.notified++;
      }
    } catch (err) {
      console.warn('[nda-expiry] dispatch failed for workspace', workspaceId, err);
    }
  }

  return result;
}
