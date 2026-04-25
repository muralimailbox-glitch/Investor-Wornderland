import postgres from 'postgres';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const DB = 'postgresql://postgres:SGjhCqKsdslMLhJHVcAnctSJebsBYWpg@shuttle.proxy.rlwy.net:37766/railway';
const DATA = 'C:/Projects/APersonal/OotaOS_Investor Wonderland/data/tracxn_investors.json';

const sql = postgres(DB, { max: 3, prepare: false });

const raw = JSON.parse(readFileSync(DATA, 'utf8'));
const entries = Array.isArray(raw) ? raw : Object.values(raw);
console.log(`Loaded ${entries.length} entries`);

const [ws] = await sql`SELECT id FROM workspaces LIMIT 1`;
const workspaceId = ws.id;

function normFirmType(t) {
  const s = (t || '').toLowerCase();
  if (s.includes('angel')) return 'angel';
  if (s.includes('family office')) return 'family_office';
  if (s.includes('cvc') || (s.includes('corporate') && !s.includes('vc'))) return 'cvc';
  if (s.includes('accelerator') || s.includes('incubator')) return 'accelerator';
  if (s.includes('syndicate')) return 'syndicate';
  return 'vc';
}

function splitSemi(s) {
  if (!s) return [];
  return s.split(';').map(x => x.trim()).filter(Boolean);
}

function parseUsd(v) {
  if (!v || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n === 0 ? null : Math.round(n);
}

const existingFirms = await sql`SELECT id, name FROM firms WHERE workspace_id = ${workspaceId}`;
const firmByName = new Map(existingFirms.map(f => [f.name.toLowerCase(), f.id]));

const existingInvs = await sql`SELECT id, email FROM investors WHERE workspace_id = ${workspaceId}`;
const invByEmail = new Map(existingInvs.map(i => [i.email.toLowerCase(), i.id]));

console.log(`DB before: ${existingFirms.length} firms, ${existingInvs.length} investors`);

// Deduplicate firms (first occurrence wins)
const firmEntries = new Map();
for (const e of entries) {
  if (e.firm_name && !firmEntries.has(e.firm_name.toLowerCase())) {
    firmEntries.set(e.firm_name.toLowerCase(), e);
  }
}

let firmsCreated = 0, firmsUpdated = 0;
for (const [key, e] of firmEntries) {
  const firmType = normFirmType(e.firm_type);
  const sectors = splitSemi(e.focus_sectors);
  const stages = splitSemi(e.stage_focus);
  const chequeMin = parseUsd(e.check_size_min);
  const chequeMax = parseUsd(e.check_size_max);
  const recentCount = e.recent_investments_count_24mo ? Number(e.recent_investments_count_24mo) || null : null;
  let recentDeals = null;
  try { recentDeals = e.notable_recent_portfolio ? JSON.parse(e.notable_recent_portfolio) : null; } catch {}

  const existingId = firmByName.get(key);
  if (existingId) {
    await sql`
      UPDATE firms SET
        firm_type      = ${firmType},
        hq_city        = ${e.location_city || null},
        hq_country     = ${e.location_country || null},
        website        = ${e.website || null},
        linkedin_url   = ${e.linkedin_url || null},
        tracxn_url     = ${e.source_url || null},
        stage_focus    = ${sql.array(stages)},
        sector_focus   = ${sql.array(sectors)},
        cheque_min_usd = ${chequeMin},
        cheque_max_usd = ${chequeMax},
        deals_last_12_months = ${recentCount},
        recent_deals   = ${recentDeals ? sql.json(recentDeals) : null},
        updated_at     = NOW()
      WHERE id = ${existingId}`;
    firmsUpdated++;
  } else {
    const newId = randomUUID();
    await sql`
      INSERT INTO firms
        (id, workspace_id, name, firm_type, hq_city, hq_country, website,
         linkedin_url, tracxn_url, stage_focus, sector_focus,
         cheque_min_usd, cheque_max_usd, deals_last_12_months, recent_deals,
         created_at, updated_at)
      VALUES
        (${newId}, ${workspaceId}, ${e.firm_name}, ${firmType},
         ${e.location_city || null}, ${e.location_country || null}, ${e.website || null},
         ${e.linkedin_url || null}, ${e.source_url || null},
         ${sql.array(stages)}, ${sql.array(sectors)},
         ${chequeMin}, ${chequeMax}, ${recentCount},
         ${recentDeals ? sql.json(recentDeals) : null},
         NOW(), NOW())`;
    firmByName.set(key, newId);
    firmsCreated++;
  }
}

// Investors
let invsCreated = 0, invsUpdated = 0, invsSkipped = 0;
for (const e of entries) {
  const partnerName = (e.partner_name || '').trim();
  if (!partnerName) { invsSkipped++; continue; }

  const firmId = firmByName.get((e.firm_name || '').toLowerCase());
  if (!firmId) continue;

  const nameParts = partnerName.split(/\s+/);
  const firstName = nameParts[0] || partnerName;
  const lastName  = nameParts.slice(1).join(' ') || '—';

  const rawEmail = (e.contact_email || '').trim().toLowerCase();
  const email = rawEmail || `${partnerName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@tracxn-no-email.invalid`;

  const sectors = splitSemi(e.focus_sectors);
  const stages  = splitSemi(e.stage_focus);
  const checkMin = parseUsd(e.check_size_min);
  const checkMax = parseUsd(e.check_size_max);

  const existingId = invByEmail.get(email);
  if (existingId) {
    await sql`
      UPDATE investors SET
        firm_id            = ${firmId},
        first_name         = ${firstName},
        last_name          = ${lastName},
        title              = ${e.partner_title || 'Partner'},
        linkedin_url       = ${e.linkedin_url || null},
        sector_interests   = ${sql.array(sectors)},
        stage_interests    = ${sql.array(stages)},
        warmth_score       = ${e.warmth_score ?? null},
        bio_summary        = ${e.fit_rationale || null},
        check_size_min_usd = ${checkMin},
        check_size_max_usd = ${checkMax},
        tracxn_url         = ${e.source_url || null},
        updated_at         = NOW()
      WHERE id = ${existingId}`;
    invsUpdated++;
  } else {
    const newId = randomUUID();
    await sql`
      INSERT INTO investors
        (id, workspace_id, firm_id, first_name, last_name, title,
         decision_authority, email, linkedin_url, sector_interests, stage_interests,
         warmth_score, bio_summary, check_size_min_usd, check_size_max_usd,
         tracxn_url, timezone, created_at, updated_at)
      VALUES
        (${newId}, ${workspaceId}, ${firmId}, ${firstName}, ${lastName},
         ${e.partner_title || 'Partner'}, 'partial', ${email},
         ${e.linkedin_url || null}, ${sql.array(sectors)}, ${sql.array(stages)},
         ${e.warmth_score ?? null}, ${e.fit_rationale || null},
         ${checkMin}, ${checkMax}, ${e.source_url || null},
         'Asia/Kolkata', NOW(), NOW())`;
    invByEmail.set(email, newId);
    invsCreated++;
  }
}

const [after] = await sql`
  SELECT
    (SELECT count(*)::int FROM firms     WHERE workspace_id = ${workspaceId}) AS firms,
    (SELECT count(*)::int FROM investors WHERE workspace_id = ${workspaceId}) AS investors`;

console.log('\n═══════════════════════════════════');
console.log('  IMPORT COMPLETE');
console.log('═══════════════════════════════════');
console.log(`  Firms:     ${firmsCreated} created, ${firmsUpdated} updated`);
console.log(`  Investors: ${invsCreated} created, ${invsUpdated} updated`);
console.log(`             ${invsSkipped} skipped (no partner name in source data)`);
console.log(`  DB after:  ${after.firms} firms, ${after.investors} investors`);
console.log('═══════════════════════════════════');

await sql.end();
