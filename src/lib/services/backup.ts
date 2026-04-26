/**
 * Lightweight nightly backup. Uses the postgres driver to dump every
 * mission-critical table as JSON, gzip-compressed, and parks it in R2 (or
 * Postgres bytea fallback). 30-day retention is enforced by the same cron
 * deleting any backup with key prefix older than the cutoff.
 *
 * NOTE: This is *not* a substitute for proper pg_dump backups managed by the
 * DB host. It's a defence-in-depth snapshot the founder controls — useful
 * for "I accidentally deleted that investor row, restore it" recovery
 * without leaning on the DB host's PITR.
 */
import { gzipSync } from 'node:zlib';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getStorage } from '@/lib/storage';

const TABLES = [
  'workspaces',
  'users',
  'firms',
  'investors',
  'leads',
  'deals',
  'documents',
  'ndas',
  'meetings',
  'interactions',
  'email_outbox',
  'audit_events',
  'knowledge_chunks',
  'invite_links',
] as const;

export type BackupResult = {
  key: string;
  bytes: number;
  tables: Array<{ name: string; rows: number }>;
  pruned: number;
};

const RETENTION_DAYS = 30;

export async function runBackup(): Promise<BackupResult> {
  const storage = getStorage();
  const counts: Array<{ name: string; rows: number }> = [];
  const dump: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    try {
      // SELECT * — wraps everything in JSON. Embeddings (pgvector) come back
      // as text-encoded arrays which is fine for restore via INSERT.
      const rows = await db.execute<Record<string, unknown>>(
        sql`SELECT * FROM ${sql.identifier(table)}`,
      );
      dump[table] = rows;
      counts.push({ name: table, rows: rows.length });
    } catch (err) {
      counts.push({ name: table, rows: -1 });
      console.warn(`[backup] table ${table} failed`, err);
    }
  }

  const json = JSON.stringify({
    generatedAt: new Date().toISOString(),
    schemaVersion: '0009',
    tables: dump,
  });
  const compressed = gzipSync(Buffer.from(json, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/${stamp}.json.gz`;
  await storage.put(key, compressed, 'application/gzip');

  // Prune older backups beyond RETENTION_DAYS by listing keys we wrote.
  // Storage interfaces don't all expose list — best-effort prune here just
  // attempts known stamp formats from the last RETENTION+30 days; misses
  // are silent.
  let pruned = 0;
  if ('list' in storage && typeof (storage as { list?: unknown }).list === 'function') {
    try {
      const list = await (
        storage as unknown as { list: (prefix: string) => Promise<{ key: string }[]> }
      ).list('backups/');
      const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
      for (const entry of list) {
        const m = entry.key.match(/backups\/(.+)\.json\.gz$/);
        if (!m?.[1]) continue;
        const ts = Date.parse(
          m[1].replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z'),
        );
        if (Number.isFinite(ts) && ts < cutoff) {
          await storage.delete(entry.key).catch(() => {});
          pruned++;
        }
      }
    } catch (err) {
      console.warn('[backup] prune failed', err);
    }
  }

  return { key, bytes: compressed.length, tables: counts, pruned };
}
