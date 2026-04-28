/**
 * Idempotent dev seed. Run via `pnpm db:seed`.
 * Creates: one workspace, one founder user, one active seed round, three firms
 * with one investor each, and one lead per investor in stage `prospect`.
 *
 * Reads founder credentials from FOUNDER_EMAIL / FOUNDER_PASSWORD env vars
 * (with optional FOUNDER_FIRST_NAME). The script bypasses @/lib/env so it can
 * run without the full env contract (e.g. R2 / Anthropic keys) being present,
 * but founder credentials are required.
 */
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { provisionFounder } from '@/lib/auth/founder-provision';

import * as schema from './schema';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the seed script');
}

if (!process.env.FOUNDER_EMAIL || !process.env.FOUNDER_PASSWORD) {
  throw new Error(
    'FOUNDER_EMAIL and FOUNDER_PASSWORD are required to seed the founder user. ' +
      'Set them in .env.local for local dev or in Railway env for production.',
  );
}
const founderEmail: string = process.env.FOUNDER_EMAIL;
const founderPassword: string = process.env.FOUNDER_PASSWORD;
const founderFirstName: string = process.env.FOUNDER_FIRST_NAME ?? 'Krish';

const sql = postgres(databaseUrl, { max: 2, prepare: false });
const db = drizzle(sql, { schema });

async function main() {
  console.log('→ seeding workspace');
  const existingWs = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.name, 'OotaOS'))
    .limit(1);
  const workspace =
    existingWs[0] ??
    (
      await db.insert(schema.workspaces).values({ name: 'OotaOS', aiMonthlyCapUsd: 50 }).returning()
    )[0];
  if (!workspace) throw new Error('workspace seed failed');
  console.log(`  workspace=${workspace.id}`);

  console.log('→ seeding founder user');
  const provision = await provisionFounder(db, {
    workspaceId: workspace.id,
    email: founderEmail,
    password: founderPassword,
    firstName: founderFirstName,
  });
  console.log(
    `  founder=${provision.userId} ${provision.rotated ? '(rotated existing)' : '(created)'}`,
  );

  console.log('→ seeding active deal');
  const existingDeals = await db
    .select()
    .from(schema.deals)
    .where(eq(schema.deals.workspaceId, workspace.id))
    .limit(1);
  const deal =
    existingDeals[0] ??
    (
      await db
        .insert(schema.deals)
        .values({
          workspaceId: workspace.id,
          roundLabel: 'Seed',
          targetSizeUsd: 2_500_000,
          preMoneyUsd: 12_000_000,
          committedUsd: 0,
          seedFunded: false,
          companyType: 'C-Corp',
          incorporationCountry: 'US-DE',
          pitchJurisdiction: 'US',
        })
        .returning()
    )[0];
  if (!deal) throw new Error('deal seed failed');
  console.log(`  deal=${deal.id}`);

  console.log('→ seeding firms + investors + leads');
  const firmSeeds: Array<{
    firmName: string;
    firmType: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate';
    hqCity: string;
    hqCountry: string;
    stageFocus: string[];
    sectorFocus: string[];
    chequeMinUsd: number;
    chequeMaxUsd: number;
    investorEmail: string;
    investorFirst: string;
    investorLast: string;
  }> = [
    {
      firmName: 'Sequoia India',
      firmType: 'vc',
      hqCity: 'Bangalore',
      hqCountry: 'IN',
      stageFocus: ['seed', 'series_a'],
      sectorFocus: ['saas', 'consumer'],
      chequeMinUsd: 1_000_000,
      chequeMaxUsd: 10_000_000,
      investorEmail: 'partner@sequoia.example',
      investorFirst: 'Priya',
      investorLast: 'Rao',
    },
    {
      firmName: 'Accel',
      firmType: 'vc',
      hqCity: 'San Francisco',
      hqCountry: 'US',
      stageFocus: ['series_a', 'series_b'],
      sectorFocus: ['b2b', 'saas'],
      chequeMinUsd: 3_000_000,
      chequeMaxUsd: 20_000_000,
      investorEmail: 'partner@accel.example',
      investorFirst: 'Marcus',
      investorLast: 'Chen',
    },
    {
      firmName: 'Angel Collective',
      firmType: 'angel',
      hqCity: 'Singapore',
      hqCountry: 'SG',
      stageFocus: ['pre_seed', 'seed'],
      sectorFocus: ['hospitality', 'fintech'],
      chequeMinUsd: 50_000,
      chequeMaxUsd: 250_000,
      investorEmail: 'invest@collective.example',
      investorFirst: 'Ayesha',
      investorLast: 'Khan',
    },
  ];

  for (const seed of firmSeeds) {
    const existingFirm = await db
      .select()
      .from(schema.firms)
      .where(eq(schema.firms.name, seed.firmName))
      .limit(1);
    const firm =
      existingFirm[0] ??
      (
        await db
          .insert(schema.firms)
          .values({
            workspaceId: workspace.id,
            name: seed.firmName,
            firmType: seed.firmType,
            hqCity: seed.hqCity,
            hqCountry: seed.hqCountry,
            stageFocus: seed.stageFocus,
            sectorFocus: seed.sectorFocus,
            chequeMinUsd: seed.chequeMinUsd,
            chequeMaxUsd: seed.chequeMaxUsd,
          })
          .returning()
      )[0];
    if (!firm) throw new Error(`firm seed failed for ${seed.firmName}`);

    const existingInvestor = await db
      .select()
      .from(schema.investors)
      .where(eq(schema.investors.email, seed.investorEmail))
      .limit(1);
    const investor =
      existingInvestor[0] ??
      (
        await db
          .insert(schema.investors)
          .values({
            workspaceId: workspace.id,
            firmId: firm.id,
            firstName: seed.investorFirst,
            lastName: seed.investorLast,
            title: 'Partner',
            decisionAuthority: 'partner',
            email: seed.investorEmail,
            timezone: seed.hqCountry === 'US' ? 'America/Los_Angeles' : 'Asia/Kolkata',
          })
          .returning()
      )[0];
    if (!investor) throw new Error(`investor seed failed for ${seed.investorEmail}`);

    const existingLead = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.investorId, investor.id))
      .limit(1);
    if (!existingLead[0]) {
      await db.insert(schema.leads).values({
        workspaceId: workspace.id,
        dealId: deal.id,
        investorId: investor.id,
        stage: 'prospect',
        sourceOfLead: 'seed-script',
        thesisFitScore: 75,
      });
    }
  }

  console.log('✓ seed complete');
}

main()
  .then(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('seed failed:', err);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
