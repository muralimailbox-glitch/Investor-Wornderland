import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { ApiError, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { dealsRepo } from '@/lib/db/repos/deals';
import { firmsRepo } from '@/lib/db/repos/firms';
import { investorsRepo, type InvestorInsert } from '@/lib/db/repos/investors';
import { leadsRepo } from '@/lib/db/repos/leads';
import { firms, investors, leads } from '@/lib/db/schema';

export type InvestorListQuery = {
  search?: string;
  stage?:
    | 'prospect'
    | 'contacted'
    | 'engaged'
    | 'nda_pending'
    | 'nda_signed'
    | 'meeting_scheduled'
    | 'diligence'
    | 'term_sheet'
    | 'funded'
    | 'closed_lost';
  firmType?: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate';
  page?: number;
  pageSize?: number;
};

export type InvestorRow = {
  investor: typeof investors.$inferSelect | null;
  firm: typeof firms.$inferSelect;
  lead: typeof leads.$inferSelect | null;
  partnerPending: boolean;
};

export async function listInvestors(workspaceId: string, query: InvestorListQuery) {
  const page = Math.max(1, query.page ?? 1);
  // Allow up to 200 per page so the cockpit can show all firms in one fetch
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  // ── Named investors ────────────────────────────────────────────────────
  const invConditions = [eq(investors.workspaceId, workspaceId)];
  if (query.search && query.search.trim().length > 0) {
    const like = `%${query.search.trim()}%`;
    invConditions.push(
      or(
        ilike(investors.firstName, like),
        ilike(investors.lastName, like),
        ilike(investors.email, like),
        ilike(firms.name, like),
      )!,
    );
  }
  if (query.firmType) invConditions.push(eq(firms.firmType, query.firmType));
  if (query.stage) invConditions.push(eq(leads.stage, query.stage));

  const invRows = await db
    .select({ investor: investors, firm: firms, lead: leads })
    .from(investors)
    .innerJoin(firms, eq(firms.id, investors.firmId))
    .leftJoin(leads, eq(leads.investorId, investors.id))
    .where(and(...invConditions))
    .orderBy(desc(investors.warmthScore), desc(investors.updatedAt));

  // ── Firms with no investor yet ("partner pending") ─────────────────────
  // Skip this bucket when filtering by stage (no lead exists for these firms)
  const pendingRows = !query.stage
    ? await db
        .select({ firm: firms })
        .from(firms)
        .leftJoin(
          investors,
          and(eq(investors.firmId, firms.id), eq(investors.workspaceId, workspaceId)),
        )
        .where(
          and(
            eq(firms.workspaceId, workspaceId),
            isNull(investors.id),
            query.firmType ? eq(firms.firmType, query.firmType) : undefined,
            query.search && query.search.trim().length > 0
              ? ilike(firms.name, `%${query.search.trim()}%`)
              : undefined,
          ),
        )
        .orderBy(desc(firms.tracxnScore), firms.name)
    : [];

  // ── Merge: named investors first (sorted by warmth), then pending firms ─
  const allRows: InvestorRow[] = [
    ...invRows.map((r) => ({ ...r, partnerPending: false as const })),
    ...pendingRows.map((r) => ({
      investor: null,
      firm: r.firm,
      lead: null,
      partnerPending: true as const,
    })),
  ];

  const total = allRows.length;
  const rows = allRows.slice(offset, offset + pageSize);

  return { rows, page, pageSize, total };
}

export type InvestorCreateInput = {
  firmId?: string | undefined;
  firmName?: string | undefined;
  firmType?: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate' | undefined;
  firstName: string;
  lastName: string;
  title: string;
  decisionAuthority: string;
  email: string;
  mobileE164?: string | undefined;
  timezone: string;
  introPath?: string | undefined;
  personalThesisNotes?: string | undefined;
};

export async function createInvestor(
  workspaceId: string,
  actorUserId: string,
  input: InvestorCreateInput,
) {
  let firmId: string;
  if (input.firmId) {
    const firm = await firmsRepo.byId(workspaceId, input.firmId);
    if (!firm) throw new NotFoundError('firm_not_found');
    firmId = firm.id;
  } else if (input.firmName && input.firmType) {
    const firm = await firmsRepo.create({
      workspaceId,
      name: input.firmName,
      firmType: input.firmType,
    });
    firmId = firm.id;
  } else {
    throw new ApiError(400, 'firm_required');
  }

  const existing = await investorsRepo.byEmail(workspaceId, input.email);
  if (existing) throw new ApiError(409, 'investor_exists');

  const payload: InvestorInsert = {
    workspaceId,
    firmId,
    firstName: input.firstName,
    lastName: input.lastName,
    title: input.title,
    decisionAuthority: input.decisionAuthority,
    email: input.email,
    timezone: input.timezone,
  };
  if (input.mobileE164) payload.mobileE164 = input.mobileE164;
  if (input.introPath) payload.introPath = input.introPath;
  if (input.personalThesisNotes) payload.personalThesisNotes = input.personalThesisNotes;

  const investor = await investorsRepo.create(payload);

  // Rule #2: every investor in an active workspace gets a lead on the
  // active deal. Without this, the pipeline stays empty for imported
  // investors. The lead is created at stage='prospect' — operator promotes
  // via the pipeline UI or auto-transitions fire on the first interaction.
  await ensureActiveLead(workspaceId, investor.id, actorUserId);

  await audit({
    workspaceId,
    actorUserId,
    action: 'investor.create',
    targetType: 'investor',
    targetId: investor.id,
    payload: { email: investor.email, firmId },
  });

  return investor;
}

/**
 * Idempotent — only creates a lead if there isn't already an active one
 * for this investor on the workspace's most-recent deal. Returns the
 * lead row (existing or newly-created). Safe to call on every investor
 * write path: createInvestor, importInvestorsCsv, bulk-import, the
 * Tracxn enrichment importer.
 */
export async function ensureActiveLead(
  workspaceId: string,
  investorId: string,
  actorUserId: string,
) {
  const dealRows = await dealsRepo.activeForWorkspace(workspaceId);
  const deal = dealRows[0];
  if (!deal) return null; // workspace has no deal yet

  const existing = await leadsRepo.activeForInvestorAndDeal(workspaceId, investorId, deal.id);
  if (existing) return existing;

  const lead = await leadsRepo.create({
    workspaceId,
    dealId: deal.id,
    investorId,
    stage: 'prospect',
    sourceOfLead: 'auto_on_investor_create',
  });
  await audit({
    workspaceId,
    actorUserId,
    action: 'lead.auto_create',
    targetType: 'lead',
    targetId: lead.id,
    payload: { investorId, dealId: deal.id },
  });
  return lead;
}

/**
 * Backfill: walk every investor in the workspace, create an active lead
 * for any that lacks one. Used by the cockpit "Repair Pipeline" button
 * to fix legacy data where investors were imported before the auto-lead
 * rule existed.
 */
export async function repairPipeline(workspaceId: string, actorUserId: string) {
  const dealRows = await dealsRepo.activeForWorkspace(workspaceId);
  const deal = dealRows[0];
  if (!deal) return { created: 0, skipped: 0, total: 0 };

  const allInvestors = await db
    .select({ id: investors.id })
    .from(investors)
    .where(eq(investors.workspaceId, workspaceId));

  let created = 0;
  let skipped = 0;
  for (const inv of allInvestors) {
    const existing = await leadsRepo.activeForInvestorAndDeal(workspaceId, inv.id, deal.id);
    if (existing) {
      skipped++;
      continue;
    }
    await leadsRepo.create({
      workspaceId,
      dealId: deal.id,
      investorId: inv.id,
      stage: 'prospect',
      sourceOfLead: 'repair_pipeline',
    });
    created++;
  }

  await audit({
    workspaceId,
    actorUserId,
    action: 'pipeline.repair',
    targetType: 'workspace',
    targetId: workspaceId,
    payload: { created, skipped, total: allInvestors.length },
  });

  return { created, skipped, total: allInvestors.length };
}

export type InvestorUpdateInput = {
  firmId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  title?: string | undefined;
  decisionAuthority?: string | undefined;
  email?: string | undefined;
  mobileE164?: string | null | undefined;
  linkedinUrl?: string | null | undefined;
  twitterHandle?: string | null | undefined;
  timezone?: string | undefined;
  introPath?: string | null | undefined;
  personalThesisNotes?: string | null | undefined;
  photoUrl?: string | null | undefined;
  city?: string | null | undefined;
  country?: string | null | undefined;
  crunchbaseUrl?: string | null | undefined;
  tracxnUrl?: string | null | undefined;
  angellistUrl?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  checkSizeMinUsd?: number | null | undefined;
  checkSizeMaxUsd?: number | null | undefined;
  sectorInterests?: string[] | null | undefined;
  stageInterests?: string[] | null | undefined;
  bioSummary?: string | null | undefined;
  warmthScore?: number | null | undefined;
};

export async function updateInvestor(
  workspaceId: string,
  actorUserId: string,
  id: string,
  patch: InvestorUpdateInput,
) {
  const existing = await investorsRepo.byId(workspaceId, id);
  if (!existing) throw new NotFoundError('investor_not_found');

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const updates: Partial<InvestorInsert> = {};
  for (const key of [
    'firstName',
    'lastName',
    'title',
    'decisionAuthority',
    'email',
    'mobileE164',
    'linkedinUrl',
    'twitterHandle',
    'timezone',
    'introPath',
    'personalThesisNotes',
    'photoUrl',
    'city',
    'country',
    'crunchbaseUrl',
    'tracxnUrl',
    'angellistUrl',
    'websiteUrl',
    'checkSizeMinUsd',
    'checkSizeMaxUsd',
    'sectorInterests',
    'stageInterests',
    'bioSummary',
    'warmthScore',
  ] as const) {
    const next = patch[key];
    if (next !== undefined && next !== (existing as Record<string, unknown>)[key]) {
      diff[key] = { before: (existing as Record<string, unknown>)[key], after: next };
      (updates as Record<string, unknown>)[key] = next;
    }
  }
  if (patch.firmId && patch.firmId !== existing.firmId) {
    const firm = await firmsRepo.byId(workspaceId, patch.firmId);
    if (!firm) throw new NotFoundError('firm_not_found');
    updates.firmId = firm.id;
    diff.firmId = { before: existing.firmId, after: firm.id };
  }

  if (Object.keys(updates).length === 0) return existing;

  const updated = await investorsRepo.update(workspaceId, id, updates);
  if (!updated) throw new NotFoundError('investor_not_found');

  await audit({
    workspaceId,
    actorUserId,
    action: 'investor.update',
    targetType: 'investor',
    targetId: id,
    payload: { diff },
  });

  return updated;
}

const CSV_HEADERS = [
  'firm_name',
  'firm_type',
  'first_name',
  'last_name',
  'title',
  'decision_authority',
  'email',
  'mobile_e164',
  'timezone',
  'intro_path',
] as const;

type CsvRow = Partial<Record<(typeof CSV_HEADERS)[number], string>>;

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const [headerLine, ...rest] = lines as [string, ...string[]];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/"|'/g, ''));
  return rest.map((line) => {
    const cols = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      if ((CSV_HEADERS as readonly string[]).includes(h)) {
        (row as Record<string, string>)[h] = cols[idx]?.trim() ?? '';
      }
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export type CsvImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function importInvestorsCsv(
  workspaceId: string,
  actorUserId: string,
  csvText: string,
): Promise<CsvImportResult> {
  const rows = parseCsv(csvText);
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    try {
      if (!r.email) throw new Error('missing_email');
      if (!r.first_name) throw new Error('missing_first_name');
      if (!r.last_name) throw new Error('missing_last_name');
      if (!r.firm_name) throw new Error('missing_firm_name');

      const existing = await investorsRepo.byEmail(workspaceId, r.email);
      if (existing) {
        skipped++;
        continue;
      }

      let firm = (await firmsRepo.list(workspaceId, r.firm_name)).find(
        (f) => f.name.toLowerCase() === r.firm_name!.toLowerCase(),
      );
      if (!firm) {
        firm = await firmsRepo.create({
          workspaceId,
          name: r.firm_name,
          firmType: (r.firm_type as 'vc') ?? 'vc',
        });
      }

      const insert: InvestorInsert = {
        workspaceId,
        firmId: firm.id,
        firstName: r.first_name,
        lastName: r.last_name,
        title: r.title ?? 'Partner',
        decisionAuthority: r.decision_authority ?? 'unknown',
        email: r.email,
        timezone: r.timezone ?? 'Asia/Kolkata',
      };
      if (r.mobile_e164) insert.mobileE164 = r.mobile_e164;
      if (r.intro_path) insert.introPath = r.intro_path;

      const inv = await investorsRepo.create(insert);
      await ensureActiveLead(workspaceId, inv.id, actorUserId);
      imported++;
    } catch (err) {
      errors.push({ row: i + 2, reason: (err as Error).message });
    }
  }

  await audit({
    workspaceId,
    actorUserId,
    action: 'investor.csv_import',
    payload: { imported, skipped, errorCount: errors.length },
  });

  return { imported, skipped, errors };
}
