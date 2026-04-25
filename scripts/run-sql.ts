/**
 * Run a SQL file against DATABASE_URL using the JS postgres driver.
 * No external tooling (psql, pg_dump) required — works anywhere Node runs.
 *
 * Usage:
 *   pnpm tsx scripts/run-sql.ts <file.sql>
 *   railway run pnpm tsx scripts/run-sql.ts drizzle/manual/drop-legacy-investor-cols.sql
 *
 * The file is split on `--> statement-breakpoint` markers (Drizzle's
 * convention). Statements without a marker run as one block. Each statement
 * runs in its own implicit transaction so a failure stops the chain
 * cleanly with the offending statement printed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const file = process.argv[2];
if (!file) {
  console.error('[run-sql] usage: pnpm tsx scripts/run-sql.ts <file.sql>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[run-sql] DATABASE_URL unset — run via `railway run`');
  process.exit(1);
}

const path = resolve(process.cwd(), file);
const raw = readFileSync(path, 'utf8');

/** Strip psql meta-commands (lines starting with `\`) — they're driver-specific. */
function stripPsqlMeta(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

const cleaned = stripPsqlMeta(raw);

// Drizzle convention: split on `--> statement-breakpoint`. If no markers
// present, fall back to splitting on bare semicolons at end-of-statement so
// hand-written SQL files (like inventory queries) still execute.
const byBreakpoint = cleaned
  .split(/-->\s*statement-breakpoint\s*/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !/^--[^\n]*$/.test(s.replace(/\s+/g, ' ')));

const fallback =
  byBreakpoint.length > 1
    ? byBreakpoint
    : cleaned
        .split(/;\s*(?:--[^\n]*)?\s*\n/)
        .map((s) => s.trim())
        .filter((s) => {
          if (!s) return false;
          // Skip pure-comment chunks (lines that are only -- comments).
          const noComments = s
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim();
          return noComments.length > 0;
        });

console.warn(`[run-sql] ${path}`);
console.warn(`[run-sql] ${fallback.length} statement(s) to execute`);

const sql = postgres(databaseUrl, { max: 2, prepare: false });

void (async () => {
  let i = 0;
  for (const stmt of fallback) {
    i++;
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 120);
    process.stdout.write(
      `[run-sql] (${i}/${fallback.length}) ${preview}${stmt.length > 120 ? ' …' : ''}\n`,
    );
    try {
      await sql.unsafe(stmt);
    } catch (err) {
      console.error(
        `[run-sql] FAILED at statement ${i}: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(`[run-sql] statement was:\n${stmt}`);
      await sql.end({ timeout: 5 });
      process.exit(1);
    }
  }
  console.warn('[run-sql] ✓ all statements executed');
  await sql.end({ timeout: 5 });
  process.exit(0);
})();
