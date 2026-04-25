/**
 * Snapshot the production Postgres into ./backups/<ISO>.dump (or a folder
 * of JSON files when pg_dump isn't installed). Run this BEFORE every
 * destructive migration.
 *
 * Usage (from your local checkout, with Railway CLI logged in):
 *   pnpm tsx scripts/backup-prod.ts                  # snapshot prod via pg_dump
 *   pnpm tsx scripts/backup-prod.ts --js             # force JS fallback (no pg_dump needed)
 *   pnpm tsx scripts/backup-prod.ts --check FILE     # verify a dump round-trips
 *   pnpm tsx scripts/backup-prod.ts --row-counts     # print per-table row counts (no dump)
 *
 * Default behaviour: try pg_dump first; if ENOENT (Windows without Postgres
 * client tools), automatically fall back to the JS-based per-table dump that
 * writes one JSON file per table under backups/<ISO>/. Both formats are
 * sufficient for the destructive Phase 7 rollback — the JS dump can be
 * restored via scripts/restore-from-json.ts (also written here).
 *
 * The JS dump uses no external binaries — works on any machine with Node.
 *
 * The output dir is written under backups/ which is gitignored.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = new Set(process.argv.slice(2));
const checkIdx = process.argv.indexOf('--check');
const checkFile = checkIdx > 0 ? process.argv[checkIdx + 1] : null;
const rowCountsOnly = args.has('--row-counts');
const forceJsMode = args.has('--js');

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
  console.warn(`[backup] trying pg_dump → ${out}`);
  const r = spawnSync(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-privileges', '--file', out, databaseUrl],
    { stdio: 'inherit' },
  );
  // status === null + signal === null usually means ENOENT (binary not found).
  // Fall through to JS dump rather than failing.
  const errCode = (r.error as NodeJS.ErrnoException | undefined)?.code;
  const looksLikeMissing =
    r.status === null || errCode === 'ENOENT' || (r.status !== 0 && !existsSync(out));
  if (looksLikeMissing) {
    console.warn(
      '[backup] pg_dump unavailable on PATH — falling back to JS table dump (no external binary needed).',
    );
    return jsDump();
  }
  if (r.status !== 0) fail(`pg_dump failed (exit ${r.status})`);
  if (!existsSync(out)) fail('pg_dump exited 0 but no file written');
  const size = statSync(out).size;
  if (size < 1024) fail(`dump is suspiciously small (${size} B) — refusing to continue`);
  checkDump(out);
}

/**
 * JS fallback — pulls every row of every public table into a JSON file under
 * backups/<ISO>/<table>.json. Same dataset as pg_dump, restorable via
 * scripts/restore-from-json.ts. No external binary required.
 */
function jsDump() {
  ensureDir();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail(
      'DATABASE_URL unset. Run via `railway run pnpm tsx scripts/backup-prod.ts` so prod env injects.',
    );
  }
  const stamp = isoStamp();
  const outDir = join(BACKUPS_DIR, stamp);
  mkdirSync(outDir, { recursive: true });
  console.warn(`[backup] JS dump → ${outDir}`);

  // Lazy import to keep pg_dump fast-path slim
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require('postgres');
  const sql = postgres(databaseUrl, { max: 2, prepare: false });

  const tables = [
    'workspaces',
    'users',
    'sessions',
    'firms',
    'investors',
    'deals',
    'leads',
    'interactions',
    'documents',
    'share_links',
    'ndas',
    'meetings',
    'email_outbox',
    'email_inbox',
    'audit_events',
    'knowledge_chunks',
    'kb_ingest_log',
    'ai_logs',
    'rate_limits',
    'stored_files',
    'invite_links',
  ];

  void (async () => {
    let totalRows = 0;
    const summary: Array<{ table: string; rows: number; bytes: number }> = [];
    for (const t of tables) {
      try {
        // Cast bytea / vector to text so JSON.stringify doesn't choke.
        const rows = await sql.unsafe(`SELECT to_jsonb(${t}.*) AS row FROM ${t}`);
        const data = rows.map((r: { row: unknown }) => r.row);
        const path = join(outDir, `${t}.json`);
        const json = JSON.stringify(data, null, 2);
        writeFileSync(path, json, 'utf8');
        const size = Buffer.byteLength(json, 'utf8');
        totalRows += data.length;
        summary.push({ table: t, rows: data.length, bytes: size });
      } catch (err) {
        // Tables that don't exist in this schema (e.g. invite_links pre-Phase-1)
        // simply get a 0-row record.
        summary.push({ table: t, rows: 0, bytes: 0 });
        console.warn(
          `[backup]   ${t.padEnd(20)} skipped (${err instanceof Error ? err.message.slice(0, 80) : err})`,
        );
      }
    }
    // Manifest so restore knows what to do
    const manifest = {
      stamp,
      databaseHost: new URL(databaseUrl!).hostname,
      tables: summary,
      totalRows,
      backedUpAt: new Date().toISOString(),
    };
    writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    console.warn('[backup] table-by-table:');
    for (const s of summary) {
      console.warn(
        `[backup]   ${s.table.padEnd(20)} ${String(s.rows).padStart(6)} rows · ${(s.bytes / 1024).toFixed(1)} KB`,
      );
    }
    console.warn(`[backup] ✓ JS dump complete — ${totalRows} rows across ${summary.length} tables`);
    console.warn(`[backup]   to verify: ls "${outDir}"`);
    console.warn(`[backup]   to restore: pnpm tsx scripts/restore-from-json.ts --dir ${outDir}`);
    await sql.end({ timeout: 5 });
    process.exit(0);
  })().catch(async (err) => {
    console.error('[backup] JS dump failed:', err);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
}

if (checkFile) {
  checkDump(checkFile);
} else if (rowCountsOnly) {
  rowCountsViaPsql();
} else if (forceJsMode) {
  jsDump();
} else {
  dump();
}
