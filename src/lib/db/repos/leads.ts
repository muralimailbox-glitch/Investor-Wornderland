import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema';

export type LeadInsert = typeof leads.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type Stage = Lead['stage'];

const ACTIVE_STAGES_NOT_IN: Stage[] = ['funded', 'closed_lost'];

export const leadsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async pipeline(workspaceId: string) {
    return db
      .select()
      .from(leads)
      .where(eq(leads.workspaceId, workspaceId))
      .orderBy(desc(leads.updatedAt));
  },
  async byStage(workspaceId: string, stage: Stage) {
    return db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.stage, stage)))
      .orderBy(desc(leads.updatedAt));
  },
  /** Active lead for a given (investor, deal) — used by lead-gate. */
  async activeForInvestorAndDeal(workspaceId: string, investorId: string, dealId: string) {
    const rows = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          eq(leads.investorId, investorId),
          eq(leads.dealId, dealId),
        ),
      )
      .orderBy(desc(leads.updatedAt));
    return rows.find((l) => !ACTIVE_STAGES_NOT_IN.includes(l.stage)) ?? null;
  },
  async create(input: LeadInsert) {
    const [row] = await db.insert(leads).values(input).returning();
    if (!row) throw new Error('lead insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<LeadInsert>) {
    const [row] = await db
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  async setStage(workspaceId: string, id: string, stage: Stage) {
    const [row] = await db
      .update(leads)
      .set({ stage, stageEnteredAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  /** Set the next-action owner+due (rule #5). Pass null to clear. */
  async setNextAction(workspaceId: string, id: string, owner: string | null, dueAt: Date | null) {
    const [row] = await db
      .update(leads)
      .set({ nextActionOwner: owner, nextActionDue: dueAt, updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  /** Mark closed-lost with a required reason (rule #6). */
  async setClosedLost(workspaceId: string, id: string, reason: string) {
    if (!reason || reason.trim().length < 3) {
      throw new Error('closed_lost_reason_required');
    }
    const [row] = await db
      .update(leads)
      .set({
        stage: 'closed_lost',
        stageEnteredAt: new Date(),
        closedLostReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  /** Mark funded with required amount + date (rule #7). */
  async setFunded(workspaceId: string, id: string, amountUsd: number, fundedAt: Date) {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error('funded_amount_required');
    }
    const [row] = await db
      .update(leads)
      .set({
        stage: 'funded',
        stageEnteredAt: new Date(),
        fundedAmountUsd: amountUsd,
        fundedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  /** Bump lastContactAt for a lead — called after every outbound + inbound interaction. */
  async touchLastContact(workspaceId: string, id: string, at: Date = new Date()) {
    await db
      .update(leads)
      .set({ lastContactAt: at, updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)));
  },
  /** Aging report — leads sitting in non-terminal stages with stale lastContactAt. */
  async aging(workspaceId: string, staleAfterDays: number = 7) {
    return db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          sql`${leads.stage} NOT IN ('funded','closed_lost')`,
          sql`(${leads.lastContactAt} IS NULL OR ${leads.lastContactAt} < now() - (${staleAfterDays} || ' days')::interval)`,
        ),
      )
      .orderBy(desc(leads.stageEnteredAt));
  },
  /** Bulk fetch by id — used by Communications screen to hydrate threaded views. */
  async byIds(workspaceId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.id, ids)));
  },
};
