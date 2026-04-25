/**
 * Container-startup bootstrap. Runs every container boot but designed to
 * exit fast (~2s) on subsequent runs via a sentinel row. First boot does
 * the full setup: founder seed → corpus + crawl + Q&A synthesis.
 *
 * Failures are caught and logged — the app still starts even if bootstrap
 * cannot complete (e.g. transient API outage during Q&A synthesis). The
 * sentinel only writes after a clean run, so a partial failure is retried
 * on the next deploy.
 *
 * Flags:
 *   --force       run all phases even if sentinel exists
 *   --skip-qa     skip the 1000+ Q&A synthesis (run founder seed + corpus + crawl only)
 *   --skip-crawl  skip the ootaos.com crawl
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
    console.log(`[bootstrap] ▸ ${label}`);
    // Use the local tsx bin via shell so it resolves on both POSIX and Windows.
    const tsxBin =
      process.platform === 'win32' ? 'node_modules\\.bin\\tsx.cmd' : 'node_modules/.bin/tsx';
    const proc = spawn(tsxBin, [cmd, ...scriptArgs], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[bootstrap] ✓ ${label}`);
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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn('[bootstrap] DATABASE_URL unset — skipping bootstrap');
    return;
  }
  if (!process.env.FOUNDER_EMAIL || !process.env.FOUNDER_PASSWORD) {
    console.warn(
      '[bootstrap] FOUNDER_EMAIL / FOUNDER_PASSWORD unset — skipping bootstrap (set them in Railway env)',
    );
    return;
  }

  // Always (re-)provision the founder so password rotations via env take effect.
  // pnpm db:seed handles workspace + founder + sample firms idempotently.
  const seedOk = await runStep('founder seed', 'src/lib/db/seed.ts');
  if (!seedOk) {
    console.warn('[bootstrap] founder seed failed — continuing so app can still boot');
  }

  // Sentinel check
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
    console.log('[bootstrap] sentinel found — KB already populated, skipping ingestion');
    return;
  }
  if (force) console.log('[bootstrap] --force passed — running all phases');

  // KB ingestion phases (each tolerant; bootstrap continues even if one fails)
  await runStep('seed knowledge (curated)', 'scripts/seed-knowledge.ts');
  await runStep('ingest corpus (Investor Pack + Design Docs)', 'scripts/ingest-corpus.ts');
  if (!skipCrawl) {
    await runStep('crawl ootaos.com', 'scripts/crawl-ootaos.ts');
  }
  if (!skipQa) {
    await runStep('synthesize 1000+ Q&A', 'scripts/synthesize-qa.ts', ['--target', '1000']);
  }

  // Write sentinel only if we got here without throwing
  try {
    const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
    const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
    const workspace = await workspacesRepo.default();
    if (workspace) {
      await kbIngestLogRepo.writeSentinel(workspace.id);
      console.log('[bootstrap] ✓ sentinel written — subsequent boots will skip ingestion');
    }
  } catch (err) {
    console.warn(`[bootstrap] sentinel write failed: ${err instanceof Error ? err.message : err}`);
  }
}

main()
  .then(() => {
    console.log('[bootstrap] complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[bootstrap] fatal — but allowing app to start:', err);
    process.exit(0); // never block container start
  });
