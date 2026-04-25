/**
 * Container-startup bootstrap. Runs every container boot but designed to
 * exit fast on subsequent runs via a sentinel row.
 *
 * Founder provisioning runs IN-PROCESS (no subprocess, no tsx lookup, no
 * PATH issues). KB ingestion phases are still spawned as subprocesses
 * because they pull in heavy native deps (Xenova model, mammoth) that we
 * don't want to load on every fast-path boot.
 *
 * Failures are caught and logged — the app still starts even if bootstrap
 * cannot complete. Read deploy logs for `[bootstrap]` lines to see what
 * happened.
 *
 * Flags:
 *   --force       run all phases even if sentinel exists
 *   --skip-qa     skip Q&A synthesis
 *   --skip-crawl  skip ootaos.com crawl
 *
 * Usage:
 *   pnpm tsx scripts/bootstrap.ts          (production: invoked by railway.toml)
 *   pnpm tsx scripts/bootstrap.ts --force  (manual re-run)
 */
import { spawn } from 'node:child_process';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const skipQa = args.has('--skip-qa');
const skipCrawl = args.has('--skip-crawl');

function runStep(label: string, cmd: string, scriptArgs: string[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    console.warn(`[bootstrap] ▸ ${label}`);
    const tsxBin =
      process.platform === 'win32' ? 'node_modules\\.bin\\tsx.cmd' : 'node_modules/.bin/tsx';
    const proc = spawn(tsxBin, [cmd, ...scriptArgs], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    proc.on('close', (code) => {
      if (code === 0) {
        console.warn(`[bootstrap] ✓ ${label}`);
        resolve(true);
      } else {
        console.error(`[bootstrap] ✗ ${label} (exit ${code})`);
        resolve(false);
      }
    });
    proc.on('error', (err) => {
      console.error(`[bootstrap] ✗ ${label} (${err.message})`);
      resolve(false);
    });
  });
}

/**
 * Founder + workspace seed run in-process. Equivalent to `pnpm db:seed` but
 * does NOT spawn a subprocess, so we don't depend on tsx being on PATH.
 */
async function seedInProcess(): Promise<void> {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const postgres = (await import('postgres')).default;
  const schema = await import('@/lib/db/schema');
  const { provisionFounder } = await import('@/lib/auth/founder-provision');
  const { eq } = await import('drizzle-orm');

  const founderEmail = process.env.FOUNDER_EMAIL;
  const founderPassword = process.env.FOUNDER_PASSWORD;
  const founderFirstName = process.env.FOUNDER_FIRST_NAME ?? 'Murali';

  if (!founderEmail || !founderPassword) {
    throw new Error('FOUNDER_EMAIL / FOUNDER_PASSWORD not set on the app service');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const sql = postgres(databaseUrl, { max: 2, prepare: false });
  const db = drizzle(sql, { schema });

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
  console.warn(`[bootstrap]   workspace=${workspace.id}`);

  const result = await provisionFounder(db, {
    workspaceId: workspace.id,
    email: founderEmail,
    password: founderPassword,
    firstName: founderFirstName,
  });
  console.warn(
    `[bootstrap]   founder=${result.userId} ${result.rotated ? '(rotated)' : '(created)'} email=${founderEmail}`,
  );
  await sql.end({ timeout: 5 });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn('[bootstrap] DATABASE_URL unset — skipping bootstrap');
    return;
  }

  // Founder seed — always runs, in-process. Failure here is loud but does
  // not block the rest of bootstrap or the app start.
  try {
    console.warn('[bootstrap] ▸ founder seed (in-process)');
    await seedInProcess();
    console.warn('[bootstrap] ✓ founder seed');
  } catch (err) {
    console.error('[bootstrap] ✗ founder seed:', err instanceof Error ? err.message : err);
  }

  // Sentinel check for KB ingestion
  let sentinelExists = false;
  try {
    const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
    const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
    const workspace = await workspacesRepo.default();
    if (workspace) {
      sentinelExists = await kbIngestLogRepo.hasSentinel(workspace.id);
    }
  } catch (err) {
    console.warn(`[bootstrap] sentinel check failed: ${err instanceof Error ? err.message : err}`);
  }

  if (sentinelExists && !force) {
    console.warn('[bootstrap] sentinel found — KB already populated, skipping ingestion');
    return;
  }
  if (force) console.warn('[bootstrap] --force passed — running all phases');

  // KB ingestion (subprocesses; heavy deps)
  await runStep('seed knowledge (curated)', 'scripts/seed-knowledge.ts');
  await runStep('ingest corpus (Investor Pack + Design Docs)', 'scripts/ingest-corpus.ts');
  if (!skipCrawl) {
    await runStep('crawl ootaos.com', 'scripts/crawl-ootaos.ts');
  }
  if (!skipQa) {
    await runStep('synthesize 1000+ Q&A', 'scripts/synthesize-qa.ts', ['--target', '1000']);
  }

  try {
    const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
    const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
    const workspace = await workspacesRepo.default();
    if (workspace) {
      await kbIngestLogRepo.writeSentinel(workspace.id);
      console.warn('[bootstrap] ✓ sentinel written');
    }
  } catch (err) {
    console.warn(`[bootstrap] sentinel write failed: ${err instanceof Error ? err.message : err}`);
  }
}

main()
  .then(() => {
    console.warn('[bootstrap] complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[bootstrap] fatal — but allowing app to start:', err);
    process.exit(0);
  });
