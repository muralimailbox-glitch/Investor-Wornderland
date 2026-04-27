import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../../src/lib/db/client';
import { auditEvents, interactions, investors, leads, ndas } from '../../../src/lib/db/schema';

export async function getInvestorByEmail(email: string) {
  const rows = await db
    .select()
    .from(investors)
    .where(eq(investors.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestLeadForInvestor(investorId: string) {
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.investorId, investorId))
    .orderBy(desc(leads.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestLeadStageByEmail(email: string) {
  const investor = await getInvestorByEmail(email);
  if (!investor) return null;
  const lead = await getLatestLeadForInvestor(investor.id);
  return lead?.stage ?? null;
}

export async function getLatestInteraction(input: {
  investorId?: string;
  leadId?: string;
  kind?: string;
}) {
  const rows = await db.select().from(interactions).orderBy(desc(interactions.createdAt)).limit(50);
  return (
    rows.find((row) => {
      if (input.investorId && row.investorId !== input.investorId) return false;
      if (input.leadId && row.leadId !== input.leadId) return false;
      if (input.kind && row.kind !== input.kind) return false;
      return true;
    }) ?? null
  );
}

export async function getLatestAuditEvent(action: string, targetId?: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.action, action))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);

  return rows.find((row) => (!targetId ? true : row.targetId === targetId)) ?? null;
}

export async function getLatestNdaForLead(leadId: string) {
  const rows = await db
    .select()
    .from(ndas)
    .where(and(eq(ndas.leadId, leadId)))
    .orderBy(desc(ndas.signedAt))
    .limit(1);
  return rows[0] ?? null;
}
