import { z } from 'zod';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { runMessage, type AiMessageParam } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';
import { firmsRepo } from '@/lib/db/repos/firms';
import { investorsRepo } from '@/lib/db/repos/investors';

const FIRM_TYPES = ['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate'] as const;

const RecentDealSchema = z.object({
  companyName: z.string().min(1).max(200),
  stage: z.string().max(60).nullable().optional(),
  amountUsd: z.number().int().nonnegative().nullable().optional(),
  date: z.string().max(40).nullable().optional(),
  sector: z.string().max(60).nullable().optional(),
});

const KeyPersonSchema = z.object({
  name: z.string().min(1).max(160),
  title: z.string().max(160).nullable().optional(),
  linkedinUrl: z.string().max(500).nullable().optional(),
});

const PercentMapSchema = z.record(z.string(), z.number().int().min(0).max(100));

export const FirmDraftSchema = z.object({
  name: z.string().min(1).max(200),
  firmType: z.enum(FIRM_TYPES).nullable().optional(),
  hqCity: z.string().nullable().optional(),
  hqCountry: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  twitterHandle: z.string().nullable().optional(),
  tracxnUrl: z.string().nullable().optional(),
  foundedYear: z.number().int().nullable().optional(),
  portfolioCount: z.number().int().nullable().optional(),
  topSectorsInPortfolio: z.array(z.string()).nullable().optional(),
  topLocationsInPortfolio: z.array(z.string()).nullable().optional(),
  topEntryRounds: z.array(z.string()).nullable().optional(),
  dealsLast12Months: z.number().int().nullable().optional(),
  // v1.1 — deeper Tracxn signals
  tracxnScore: z.number().int().min(0).max(100).nullable().optional(),
  medianPortfolioTracxnScore: z.number().int().min(0).max(100).nullable().optional(),
  portfolioIpos: z.number().int().nonnegative().nullable().optional(),
  portfolioAcquisitions: z.number().int().nonnegative().nullable().optional(),
  portfolioUnicorns: z.number().int().nonnegative().nullable().optional(),
  portfolioSoonicorns: z.number().int().nonnegative().nullable().optional(),
  teamSizeTotal: z.number().int().nonnegative().nullable().optional(),
  fundClassification: z.array(z.string().max(60)).nullable().optional(),
  operatingLocation: z.string().max(200).nullable().optional(),
  stageDistribution: PercentMapSchema.nullable().optional(),
  sectorDistribution: PercentMapSchema.nullable().optional(),
  locationDistribution: PercentMapSchema.nullable().optional(),
  specialFlags: z.array(z.string().max(60)).nullable().optional(),
  recentDeals: z.array(RecentDealSchema).max(30).nullable().optional(),
  keyPeople: z.array(KeyPersonSchema).max(30).nullable().optional(),
});

export const InvestorDraftSchema = z.object({
  firmName: z.string().min(1).max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  decisionAuthority: z.enum(['full', 'partial', 'influencer', 'none']),
  email: z.string().email().nullable().optional(),
  mobileE164: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  twitterHandle: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  crunchbaseUrl: z.string().nullable().optional(),
  tracxnUrl: z.string().nullable().optional(),
  angellistUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  checkSizeMinUsd: z.number().int().nullable().optional(),
  checkSizeMaxUsd: z.number().int().nullable().optional(),
  sectorInterests: z.array(z.string()).nullable().optional(),
  stageInterests: z.array(z.string()).nullable().optional(),
  bioSummary: z.string().nullable().optional(),
  warmthScore: z.number().int().min(0).max(100).nullable().optional(),
});

export const ParseResultSchema = z.object({
  firms: z.array(FirmDraftSchema).max(10),
  investors: z.array(InvestorDraftSchema).max(50),
  unmatched: z.array(z.string()).default([]),
});

export type FirmDraft = z.infer<typeof FirmDraftSchema>;
export type InvestorDraft = z.infer<typeof InvestorDraftSchema>;
export type TracxnParseResult = z.infer<typeof ParseResultSchema>;

function stripCodeFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    const firstNl = text.indexOf('\n');
    if (firstNl !== -1) text = text.slice(firstNl + 1);
    if (text.endsWith('```')) text = text.slice(0, -3).trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

export async function parsePastedTracxn(
  workspaceId: string,
  rawText: string,
): Promise<TracxnParseResult> {
  if (!rawText.trim()) return { firms: [], investors: [], unmatched: [] };

  const cap = await checkCap(workspaceId);
  if (cap.exceeded) throw new CapExceededError(cap);

  const prompt = loadPrompt('tracxn-parse');

  const messages: AiMessageParam[] = [
    { role: 'user', content: `## TRACXN PAGE CONTENT\n\n${rawText.slice(0, 30000)}` },
  ];

  const result = await runMessage({
    workspaceId,
    agent: 'curator',
    model: prompt.model,
    promptHash: prompt.hash,
    promptVersion: prompt.version,
    system: prompt.body,
    messages,
    maxTokens: prompt.maxTokens,
    temperature: prompt.temperature,
  });

  const jsonText = stripCodeFences(result.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { firms: [], investors: [], unmatched: [rawText.slice(0, 2000)] };
  }

  const safe = ParseResultSchema.safeParse(parsed);
  if (!safe.success) {
    return { firms: [], investors: [], unmatched: [rawText.slice(0, 2000)] };
  }
  return safe.data;
}

export type BulkImportInput = {
  firms?: FirmDraft[];
  investors: InvestorDraft[];
};

export type BulkRowStatus =
  | {
      kind: 'investor';
      email: string;
      status: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
    }
  | {
      kind: 'firm';
      name: string;
      status: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
    };

export type BulkImportResult = {
  firmsCreated: number;
  firmsUpdated: number;
  investorsCreated: number;
  investorsUpdated: number;
  rows: BulkRowStatus[];
  dryRun: boolean;
};

function normFirmType(t: FirmDraft['firmType']): (typeof FIRM_TYPES)[number] {
  return t && FIRM_TYPES.includes(t) ? t : 'vc';
}

export async function bulkImport(
  workspaceId: string,
  input: BulkImportInput,
  opts: { dryRun?: boolean } = {},
): Promise<BulkImportResult> {
  const dryRun = Boolean(opts.dryRun);
  const rows: BulkRowStatus[] = [];
  let firmsCreated = 0;
  let firmsUpdated = 0;
  let investorsCreated = 0;
  let investorsUpdated = 0;

  const firmByName = new Map<string, { id: string; name: string }>();
  const existingFirms = await firmsRepo.list(workspaceId);
  for (const f of existingFirms) firmByName.set(f.name.toLowerCase(), { id: f.id, name: f.name });

  for (const firm of input.firms ?? []) {
    const key = firm.name.trim().toLowerCase();
    const existing = firmByName.get(key);
    const patch = {
      ...(firm.hqCity !== undefined ? { hqCity: firm.hqCity } : {}),
      ...(firm.hqCountry !== undefined ? { hqCountry: firm.hqCountry } : {}),
      ...(firm.websiteUrl !== undefined ? { website: firm.websiteUrl } : {}),
      ...(firm.linkedinUrl !== undefined ? { linkedinUrl: firm.linkedinUrl } : {}),
      ...(firm.twitterHandle !== undefined ? { twitterHandle: firm.twitterHandle } : {}),
      ...(firm.tracxnUrl !== undefined ? { tracxnUrl: firm.tracxnUrl } : {}),
      ...(firm.foundedYear !== undefined ? { foundedYear: firm.foundedYear } : {}),
      ...(firm.portfolioCount !== undefined ? { portfolioCount: firm.portfolioCount } : {}),
      ...(firm.topSectorsInPortfolio !== undefined
        ? { topSectorsInPortfolio: firm.topSectorsInPortfolio }
        : {}),
      ...(firm.topLocationsInPortfolio !== undefined
        ? { topLocationsInPortfolio: firm.topLocationsInPortfolio }
        : {}),
      ...(firm.topEntryRounds !== undefined ? { topEntryRounds: firm.topEntryRounds } : {}),
      ...(firm.dealsLast12Months !== undefined
        ? { dealsLast12Months: firm.dealsLast12Months }
        : {}),
      ...(firm.tracxnScore !== undefined ? { tracxnScore: firm.tracxnScore } : {}),
      ...(firm.medianPortfolioTracxnScore !== undefined
        ? { medianPortfolioTracxnScore: firm.medianPortfolioTracxnScore }
        : {}),
      ...(firm.portfolioIpos !== undefined ? { portfolioIpos: firm.portfolioIpos } : {}),
      ...(firm.portfolioAcquisitions !== undefined
        ? { portfolioAcquisitions: firm.portfolioAcquisitions }
        : {}),
      ...(firm.portfolioUnicorns !== undefined
        ? { portfolioUnicorns: firm.portfolioUnicorns }
        : {}),
      ...(firm.portfolioSoonicorns !== undefined
        ? { portfolioSoonicorns: firm.portfolioSoonicorns }
        : {}),
      ...(firm.teamSizeTotal !== undefined ? { teamSizeTotal: firm.teamSizeTotal } : {}),
      ...(firm.fundClassification !== undefined
        ? { fundClassification: firm.fundClassification }
        : {}),
      ...(firm.operatingLocation !== undefined
        ? { operatingLocation: firm.operatingLocation }
        : {}),
      ...(firm.stageDistribution !== undefined
        ? { stageDistribution: firm.stageDistribution }
        : {}),
      ...(firm.sectorDistribution !== undefined
        ? { sectorDistribution: firm.sectorDistribution }
        : {}),
      ...(firm.locationDistribution !== undefined
        ? { locationDistribution: firm.locationDistribution }
        : {}),
      ...(firm.specialFlags !== undefined ? { specialFlags: firm.specialFlags } : {}),
      ...(firm.recentDeals !== undefined ? { recentDeals: firm.recentDeals } : {}),
      ...(firm.keyPeople !== undefined ? { keyPeople: firm.keyPeople } : {}),
    };

    if (existing) {
      if (!dryRun) {
        const updated = await firmsRepo.update(workspaceId, existing.id, patch);
        if (updated) firmsUpdated += 1;
      } else {
        firmsUpdated += 1;
      }
      rows.push({ kind: 'firm', name: firm.name, status: 'updated', id: existing.id });
    } else {
      if (!dryRun) {
        const created = await firmsRepo.create({
          workspaceId,
          name: firm.name,
          firmType: normFirmType(firm.firmType),
          ...patch,
        });
        firmByName.set(key, { id: created.id, name: created.name });
        firmsCreated += 1;
        rows.push({ kind: 'firm', name: firm.name, status: 'created', id: created.id });
      } else {
        firmsCreated += 1;
        rows.push({ kind: 'firm', name: firm.name, status: 'created' });
      }
    }
  }

  for (const inv of input.investors) {
    const firmKey = inv.firmName.trim().toLowerCase();
    let firmRef = firmByName.get(firmKey);
    if (!firmRef) {
      if (dryRun) {
        rows.push({
          kind: 'investor',
          email: inv.email ?? `${inv.firstName}.${inv.lastName}`,
          status: 'skipped',
          reason: 'firm_created_on_apply',
        });
        investorsCreated += 1;
        continue;
      }
      const createdFirm = await firmsRepo.create({
        workspaceId,
        name: inv.firmName,
        firmType: 'vc',
      });
      firmRef = { id: createdFirm.id, name: createdFirm.name };
      firmByName.set(firmKey, firmRef);
      firmsCreated += 1;
    }

    const emailForLookup = inv.email?.trim().toLowerCase();
    const existingInv = emailForLookup
      ? await investorsRepo.byEmail(workspaceId, emailForLookup)
      : null;

    const patch = {
      firmId: firmRef.id,
      firstName: inv.firstName,
      lastName: inv.lastName,
      title: inv.title,
      decisionAuthority: inv.decisionAuthority,
      ...(emailForLookup ? { email: emailForLookup } : {}),
      ...(inv.mobileE164 !== undefined ? { mobileE164: inv.mobileE164 } : {}),
      ...(inv.linkedinUrl !== undefined ? { linkedinUrl: inv.linkedinUrl } : {}),
      ...(inv.twitterHandle !== undefined ? { twitterHandle: inv.twitterHandle } : {}),
      ...(inv.timezone !== undefined && inv.timezone !== null ? { timezone: inv.timezone } : {}),
      ...(inv.city !== undefined ? { city: inv.city } : {}),
      ...(inv.country !== undefined ? { country: inv.country } : {}),
      ...(inv.photoUrl !== undefined ? { photoUrl: inv.photoUrl } : {}),
      ...(inv.crunchbaseUrl !== undefined ? { crunchbaseUrl: inv.crunchbaseUrl } : {}),
      ...(inv.tracxnUrl !== undefined ? { tracxnUrl: inv.tracxnUrl } : {}),
      ...(inv.angellistUrl !== undefined ? { angellistUrl: inv.angellistUrl } : {}),
      ...(inv.websiteUrl !== undefined ? { websiteUrl: inv.websiteUrl } : {}),
      ...(inv.checkSizeMinUsd !== undefined ? { checkSizeMinUsd: inv.checkSizeMinUsd } : {}),
      ...(inv.checkSizeMaxUsd !== undefined ? { checkSizeMaxUsd: inv.checkSizeMaxUsd } : {}),
      ...(inv.sectorInterests !== undefined ? { sectorInterests: inv.sectorInterests } : {}),
      ...(inv.stageInterests !== undefined ? { stageInterests: inv.stageInterests } : {}),
      ...(inv.bioSummary !== undefined ? { bioSummary: inv.bioSummary } : {}),
      ...(inv.warmthScore !== undefined ? { warmthScore: inv.warmthScore } : {}),
    };

    if (existingInv) {
      if (!dryRun) {
        const updated = await investorsRepo.update(workspaceId, existingInv.id, patch);
        if (updated) investorsUpdated += 1;
      } else {
        investorsUpdated += 1;
      }
      rows.push({
        kind: 'investor',
        email: emailForLookup ?? `${inv.firstName}.${inv.lastName}`,
        status: 'updated',
        id: existingInv.id,
      });
    } else {
      if (!emailForLookup) {
        rows.push({
          kind: 'investor',
          email: `${inv.firstName}.${inv.lastName}`,
          status: 'skipped',
          reason: 'missing_email',
        });
        continue;
      }
      if (!dryRun) {
        const created = await investorsRepo.create({
          workspaceId,
          ...patch,
          email: emailForLookup,
          timezone: inv.timezone ?? 'Asia/Kolkata',
        });
        investorsCreated += 1;
        rows.push({ kind: 'investor', email: emailForLookup, status: 'created', id: created.id });
      } else {
        investorsCreated += 1;
        rows.push({ kind: 'investor', email: emailForLookup, status: 'created' });
      }
    }
  }

  return { firmsCreated, firmsUpdated, investorsCreated, investorsUpdated, rows, dryRun };
}
