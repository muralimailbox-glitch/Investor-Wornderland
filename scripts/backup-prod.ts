/**
 * Snapshot the production Postgres into ./backups/<ISO>.dump using
 * `pg_dump --format=custom`. Run this BEFORE every destructive migration.
 *
 * Usage (from your local checkout, with Railway CLI logged in):
 *   pnpm tsx scripts/backup-prod.ts                  # snapshot prod via railway env
 *   pnpm tsx scripts/backup-prod.ts --check FILE     # verify a dump round-trips
 *   pnpm tsx scripts/backup-prod.ts --row-counts     # print per-table row counts (no dump)
 *
 * Requires:
 *   - Railway CLI ("railway run" injects DATABASE_URL).
 *   - pg_dump on PATH (Postgres 16 client tools — same major as the prod DB).
 *
 * The dump file is written under backups/ which is gitignored. Verify the
 * dump round-trips before continuing to the destructive migration:
 *   pg_restore --list backups/2026-04-25T22-00-00.dump  # should print TOC
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = new Set(process.argv.slice(2));
const checkIdx = process.argv.indexOf('--check');
const checkFile = checkIdx > 0 ? process.argv[checkIdx + 1] : null;
const rowCountsOnly = args.has('--row-counts');

const BACKUPS_DIR = resolve(process.cwd(), 'backups');

function ensureDir() {
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    console.warn(`[backup] created ${BACKUPS_DIR}`);
  }
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').replace(/Z$/, '');
}

function fail(msg: string): never {
  console.error(`[backup] ${msg}`);
  process.exit(1);
}

function checkDump(file: string) {
  if (!existsSync(file)) fail(`dump not found: ${file}`);
  const size = statSync(file).size;
  if (size === 0) fail(`dump is empty: ${file}`);
  const r = spawnSync('pg_restore', ['--list', file], { encoding: 'utf8' });
  if (r.status !== 0) fail(`pg_restore --list failed: ${r.stderr}`);
  const tables = (r.stdout.match(/TABLE DATA /g) ?? []).length;
  console.warn(`[backup] ${file}`);
  console.warn(`[backup]   size  : ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.warn(`[backup]   tables: ${tables}`);
  console.warn('[backup] dump round-trips ✓');
}

function rowCountsViaPsql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    fail('DATABASE_URL unset — run via `railway run pnpm tsx scripts/backup-prod.ts`');
  const tables = [
    'workspaces',
    'users',
    'firms',
    'investors',
    'leads',
    'deals',
    'interactions',
    'documents',
    'ndas',
    'meetings',
    'email_outbox',
    'email_inbox',
    'audit_events',
    'knowledge_chunks',
    'kb_ingest_log',
    'ai_logs',
    'share_links',
    'stored_files',
  ];
  const queries = tables
    .map((t) => `SELECT '${t}' AS tbl, count(*)::bigint AS n FROM ${t}`)
    .join(' UNION ALL ');
  const r = spawnSync(
    'psql',
    [databaseUrl, '-A', '-t', '-F', '\t', '-c', `${queries} ORDER BY tbl`],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) fail(`psql failed: ${r.stderr}`);
  console.warn('[backup] row counts (live prod):');
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [tbl, n] = line.split('\t');
    console.warn(`[backup]   ${(tbl ?? '').padEnd(20)} ${n ?? ''}`);
  }
}

function dump() {
  ensureDir();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail(
      'DATABASE_URL unset. Run via `railway run pnpm tsx scripts/backup-prod.ts` so prod env injects.',
    );
  }
  const out = join(BACKUPS_DIR, `${isoStamp()}.dump`);
  console.warn(`[backup] dumping prod → ${out}`);
  const r = spawnSync(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-privileges', '--file', out, databaseUrl],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) fail(`pg_dump failed (exit ${r.status})`);
  if (!existsSync(out)) fail('pg_dump exited 0 but no file written');
  const size = statSync(out).size;
  if (size < 1024) fail(`dump is suspiciously small (${size} B) — refusing to continue`);
  checkDump(out);
}

if (checkFile) {
  checkDump(checkFile);
} else if (rowCountsOnly) {
  rowCountsViaPsql();
} else {
  dump();
}
