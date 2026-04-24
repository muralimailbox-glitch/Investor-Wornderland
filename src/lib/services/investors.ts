import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { ApiError, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { firmsRepo } from '@/lib/db/repos/firms';
import { investorsRepo, type InvestorInsert } from '@/lib/db/repos/investors';
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
  investor: typeof investors.$inferSelect;
  firm: typeof firms.$inferSelect;
  lead: typeof leads.$inferSelect | null;
};

export async function listInvestors(workspaceId: string, query: InvestorListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(investors.workspaceId, workspaceId)];
  if (query.search && query.search.trim().length > 0) {
    const like = `%${query.search.trim()}%`;
    conditions.push(
      or(
        ilike(investors.firstName, like),
        ilike(investors.lastName, like),
        ilike(investors.email, like),
        ilike(firms.name, like),
      )!,
    );
  }
  if (query.firmType) conditions.push(eq(firms.firmType, query.firmType));
  if (query.stage) conditions.push(eq(leads.stage, query.stage));

  const rows = await db
    .select({
      investor: investors,
      firm: firms,
      lead: leads,
    })
    .from(investors)
    .innerJoin(firms, eq(firms.id, investors.firmId))
    .leftJoin(leads, eq(leads.investorId, investors.id))
    .where(and(...conditions))
    .orderBy(desc(investors.updatedAt))
    .limit(pageSize)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(investors)
    .innerJoin(firms, eq(firms.id, investors.firmId))
    .leftJoin(leads, eq(leads.investorId, investors.id))
    .where(and(...conditions));

  return {
    rows,
    page,
    pageSize,
    total: Number(total[0]?.count ?? 0),
  };
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

export type InvestorUpdateInput = {
  firmId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  title?: string | undefined;
  decisionAuthority?: string | undefined;
  email?: string | undefined;
  mobileE164?: string | undefined;
  timezone?: string | undefined;
  introPath?: string | undefined;
  personalThesisNotes?: string | undefined;
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
    'timezone',
    'introPath',
    'personalThesisNotes',
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

      await investorsRepo.create(insert);
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
