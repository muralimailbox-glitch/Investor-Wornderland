/**
 * One-shot importer for the captured Tracxn datasets in /data.
 *
 *   node_modules/.bin/tsx scripts/import-tracxn.ts            # dry-run
 *   node_modules/.bin/tsx scripts/import-tracxn.ts --apply    # actually import
 *
 * Reads the three captured files, deduplicates across them by case-folded
 * firm name + lowercased contact email, maps each row into the
 * `bulkImport` service's `InvestorDraft` / `FirmDraft` shape, and posts
 * them in batches of 50 (the schema's max).
 *
 * Files consumed:
 *   - data/tracxn_investors.json       (~25 records, richest field set)
 *   - data/tracxn_investors.csv        (58 rows; same headers as JSON)
 *   - data/fresh_200_investors.csv     (200 firm-level rows; minimal fields)
 *
 * Firm-only mode: rows with no `partner_name` / `contact_email` create
 * the firm only and are reported as "firm_only" in the output. The
 * cockpit's "partner pending" UI already supports this state.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

// Imported lazily after env loads so the schema-validated `env` doesn't
// fail at module-eval time on a missing var.
async function loadDeps() {
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema');
  const { bulkImport } = await import('../src/lib/services/tracxn-import');
  return { db, users, bulkImport };
}

const apply = process.argv.includes('--apply');
const DATA_DIR = resolve(__dirname, '..', '..', 'data');

// ── File loaders ───────────────────────────────────────────────────────

type RawTracxnInvestor = {
  investor_name?: string;
  firm_name: string;
  firm_type?: string;
  website?: string;
  linkedin_url?: string;
  location_city?: string;
  location_country?: string;
  focus_sectors?: string;
  stage_focus?: string;
  check_size_min?: string | number;
  check_size_max?: string | number;
  check_size_currency?: string;
  recent_investments_count_24mo?: number;
  notable_recent_portfolio?: string;
  partner_name?: string;
  partner_title?: string;
  contact_email?: string;
  source_url?: string;
  captured_at?: string;
  fit_rationale?: string;
  warmth_score?: number;
};

type RawFresh200 = {
  firm_name: string;
  funding_rounds_24mo?: string;
  website?: string;
  email?: string;
  phone?: string;
  tracxn_url?: string;
  sectors?: string;
  hq_location?: string;
  source_notes?: string;
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf8')) as T;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
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

function readCsv(file: string): Array<Record<string, string>> {
  const text = readFileSync(resolve(DATA_DIR, file), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    return row;
  });
}

// ── Field shaping ──────────────────────────────────────────────────────

/** Normalise firm name for dedupe: lowercase, collapse whitespace, strip punctuation. */
function firmKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[.,&]/g, '')
    .trim();
}

/** Tracxn sector strings look like `Enterprise Applications (25)` — drop the count. */
function cleanSectorList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim().replace(/\s*\(\d+\)\s*$/, ''))
    .filter((s) => s.length > 0);
}

function cleanStageList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Map "VC, Incubators" / "Angel Network" / etc. to the FirmType enum. */
function normFirmType(
  raw: string | undefined,
): 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate' {
  if (!raw) return 'vc';
  const lower = raw.toLowerCase();
  if (lower.includes('cvc') || lower.includes('corporate')) return 'cvc';
  if (lower.includes('angel') && lower.includes('network')) return 'syndicate';
  if (lower.includes('angel')) return 'angel';
  if (lower.includes('family')) return 'family_office';
  if (lower.includes('incubator') || lower.includes('accelerator')) return 'accelerator';
  if (lower.includes('syndicate')) return 'syndicate';
  return 'vc';
}

/** Tracxn warmth_score is 1-10; the schema expects 0-100. Rescale. */
function scaleWarmth(raw: number | undefined): number | undefined {
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  const n = Number(raw);
  if (n <= 10) return Math.round(n * 10);
  if (n <= 100) return Math.round(n);
  return 100;
}

function splitName(full: string | undefined): { first: string; last: string } | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  if (parts.length === 1) return { first: parts[0]!, last: '—' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
}

type FirmDraft = {
  name: string;
  firmType: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate';
  hqCity?: string | null;
  hqCountry?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  tracxnUrl?: string | null;
};

type InvestorDraft = {
  firmName: string;
  firstName: string;
  lastName: string;
  title: string;
  decisionAuthority: 'full' | 'partial' | 'influencer' | 'none';
  email?: string | null;
  linkedinUrl?: string | null;
  city?: string | null;
  country?: string | null;
  tracxnUrl?: string | null;
  websiteUrl?: string | null;
  sectorInterests?: string[] | null;
  stageInterests?: string[] | null;
  bioSummary?: string | null;
  fitRationale?: string | null;
  warmthScore?: number | null;
};

function mapTracxnRecord(r: RawTracxnInvestor): {
  firm: FirmDraft;
  investor: InvestorDraft | null;
} {
  const firm: FirmDraft = {
    name: r.firm_name.trim(),
    firmType: normFirmType(r.firm_type),
    hqCity: r.location_city || null,
    hqCountry: r.location_country || null,
    websiteUrl: r.website || null,
    linkedinUrl: r.linkedin_url || null,
    tracxnUrl: r.source_url || null,
  };

  const partner = splitName(r.partner_name);
  const hasPartnerSignal = Boolean(partner || r.contact_email);

  if (!hasPartnerSignal) {
    return { firm, investor: null };
  }

  const investor: InvestorDraft = {
    firmName: firm.name,
    firstName: partner?.first ?? r.firm_name.trim(),
    lastName: partner?.last ?? '—',
    title: r.partner_title?.trim() || 'Partner',
    decisionAuthority: 'full',
    email: r.contact_email?.trim().toLowerCase() || null,
    linkedinUrl: r.linkedin_url || null,
    city: r.location_city || null,
    country: r.location_country || null,
    tracxnUrl: r.source_url || null,
    websiteUrl: r.website || null,
    sectorInterests: cleanSectorList(r.focus_sectors),
    stageInterests: cleanStageList(r.stage_focus),
    fitRationale: r.fit_rationale?.trim() || null,
    warmthScore: scaleWarmth(r.warmth_score) ?? null,
  };
  return { firm, investor };
}

function mapFresh200Record(r: RawFresh200): { firm: FirmDraft; investor: InvestorDraft | null } {
  // hq_location is sometimes "Bengaluru" or "Toronto [+6]" — strip the [+N] suffix
  const hqRaw = (r.hq_location ?? '').replace(/\s*\[\+\d+\]\s*/g, '').trim();
  const firm: FirmDraft = {
    name: r.firm_name.trim(),
    firmType: 'vc',
    hqCity: hqRaw || null,
    hqCountry: null,
    websiteUrl: r.website || null,
    linkedinUrl: null,
    tracxnUrl: r.tracxn_url || null,
  };
  // No partner data in this CSV — firm-only entry.
  if (!r.email) return { firm, investor: null };
  const investor: InvestorDraft = {
    firmName: firm.name,
    firstName: r.firm_name.trim(),
    lastName: '—',
    title: 'Unknown',
    decisionAuthority: 'none',
    email: r.email.trim().toLowerCase(),
    city: hqRaw || null,
    tracxnUrl: r.tracxn_url || null,
    websiteUrl: r.website || null,
    sectorInterests: cleanSectorList(r.sectors),
  };
  return { firm, investor };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Tracxn importer — ${apply ? 'APPLY' : 'DRY RUN'}\n`);

  const { db, users, bulkImport } = await loadDeps();

  // Resolve founder workspace + actor.
  const [founder] = await db
    .select({ id: users.id, workspaceId: users.workspaceId })
    .from(users)
    .where(eq(users.role, 'founder'))
    .limit(1);
  if (!founder) {
    console.error('No founder user found — cannot import without a workspace.');
    process.exit(1);
  }
  console.log(`Founder workspaceId=${founder.workspaceId}\n`);

  // Read all three sources.
  const tracxnJson = readJson<RawTracxnInvestor[]>('tracxn_investors.json');
  const tracxnCsv = readCsv('tracxn_investors.csv') as unknown as RawTracxnInvestor[];
  const fresh200 = readCsv('fresh_200_investors.csv') as unknown as RawFresh200[];

  console.log(`Loaded:`);
  console.log(`  tracxn_investors.json:    ${tracxnJson.length} rows`);
  console.log(`  tracxn_investors.csv:     ${tracxnCsv.length} rows`);
  console.log(`  fresh_200_investors.csv:  ${fresh200.length} rows`);

  // Map each source into shared draft shape.
  const tracxnMapped = [...tracxnJson, ...tracxnCsv].map(mapTracxnRecord);
  const fresh200Mapped = fresh200.map(mapFresh200Record);
  const allMapped = [...tracxnMapped, ...fresh200Mapped];

  // Dedupe firms by case-folded name; later entries win on conflicts so
  // the richest record (tracxn JSON) overrides leaner CSV entries.
  const firmsByKey = new Map<string, FirmDraft>();
  for (const m of allMapped) {
    const key = firmKey(m.firm.name);
    if (!key) continue;
    const existing = firmsByKey.get(key);
    firmsByKey.set(key, existing ? { ...existing, ...m.firm } : m.firm);
  }

  // Dedupe investors by email (lowercased) when present, else by
  // (firmKey, firstName lowercased) so two real partners at the same firm
  // don't collide.
  const investorsByKey = new Map<string, InvestorDraft>();
  let firmOnly = 0;
  for (const m of allMapped) {
    if (!m.investor) {
      firmOnly++;
      continue;
    }
    const inv = m.investor;
    const dedupeKey = inv.email
      ? `e:${inv.email}`
      : `f:${firmKey(inv.firmName)}|n:${inv.firstName.toLowerCase()}`;
    if (!investorsByKey.has(dedupeKey)) investorsByKey.set(dedupeKey, inv);
  }

  console.log(`\nAfter dedup:`);
  console.log(`  unique firms:               ${firmsByKey.size}`);
  console.log(`  unique partners (with sig): ${investorsByKey.size}`);
  console.log(`  firm-only entries:          ${firmOnly}`);

  if (!apply) {
    console.log('\nDry run — re-run with --apply to import.');
    process.exit(0);
  }

  // Submit in batches matching the bulkImport schema cap (firms max 10,
  // investors max 50). Iterate firms first so investor inserts can find
  // a parent firm row.
  const firms = [...firmsByKey.values()];
  const investors = [...investorsByKey.values()];

  let firmsCreated = 0;
  let firmsUpdated = 0;
  let investorsCreated = 0;
  let investorsUpdated = 0;
  const errors: string[] = [];

  // Run firms in batches of 10, with no investors attached.
  console.log(`\nImporting ${firms.length} firms in batches of 10...`);
  for (let i = 0; i < firms.length; i += 10) {
    const slice = firms.slice(i, i + 10);
    try {
      const result = await bulkImport(
        founder.workspaceId,
        { firms: slice, investors: [] },
        { dryRun: false, actorUserId: founder.id },
      );
      firmsCreated += result.firmsCreated;
      firmsUpdated += result.firmsUpdated;
      process.stdout.write(`  firms ${i + slice.length}/${firms.length}\r`);
    } catch (err) {
      errors.push(`firms[${i}..${i + slice.length}]: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  console.log('');

  // Then investors (max 50 per call).
  console.log(`\nImporting ${investors.length} partners in batches of 50...`);
  for (let i = 0; i < investors.length; i += 50) {
    const slice = investors.slice(i, i + 50);
    try {
      const result = await bulkImport(
        founder.workspaceId,
        { firms: [], investors: slice },
        { dryRun: false, actorUserId: founder.id },
      );
      investorsCreated += result.investorsCreated;
      investorsUpdated += result.investorsUpdated;
      process.stdout.write(`  partners ${i + slice.length}/${investors.length}\r`);
    } catch (err) {
      errors.push(`investors[${i}..${i + slice.length}]: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  console.log('');

  console.log(`\n── Import complete ──`);
  console.log(`  firms created:     ${firmsCreated}`);
  console.log(`  firms updated:     ${firmsUpdated}`);
  console.log(`  partners created:  ${investorsCreated}`);
  console.log(`  partners updated:  ${investorsUpdated}`);
  if (errors.length > 0) {
    console.log(`\n  errors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`    - ${e}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('IMPORTER CRASHED:', err);
  process.exit(2);
});
