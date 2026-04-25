/**
 * Ingest every .docx in the Investor Pack into knowledge_chunks so the
 * concierge has real grounded content to retrieve from.
 *
 * Usage:
 *   pnpm tsx scripts/ingest-investor-pack.ts
 *   pnpm tsx scripts/ingest-investor-pack.ts --pack "../Investor Pack/All files V2"
 *   pnpm tsx scripts/ingest-investor-pack.ts --wipe   # wipe knowledge first
 *
 * Each .docx becomes one logical "section" (derived from the filename).
 * Mammoth extracts the body text; chunkText() inside the knowledge
 * service splits it into ~600-char passages and embeds each one.
 *
 * Run AFTER `pnpm db:seed` and `pnpm tsx scripts/seed-knowledge.ts`.
 * It's additive — re-running ingests new content under a fresh version
 * tag (timestamp), it does not deduplicate. Use --wipe to start clean.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const packFlag = args.indexOf('--pack');
const wipe = args.includes('--wipe');
const packPath = packFlag !== -1 ? args[packFlag + 1]! : '../Investor Pack/All files V2';

function sectionFromFilename(file: string): string {
  // OotaOS_Term_Sheet.docx -> term_sheet
  const stem = basename(file, extname(file));
  return stem
    .replace(/^OotaOS[_-]?/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function readDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function main() {
  const absPack = resolve(process.cwd(), packPath);
  console.log(`[ingest] scanning ${absPack}`);
  let entries: string[] = [];
  try {
    entries = readdirSync(absPack);
  } catch (err) {
    console.error(
      `[ingest] cannot read pack directory: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }

  const docxFiles = entries
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .map((f) => join(absPack, f))
    .filter((f) => statSync(f).isFile());

  if (docxFiles.length === 0) {
    console.error('[ingest] no .docx files found');
    process.exit(1);
  }

  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { usersRepo } = await import('@/lib/db/repos/users');
  const { ingestKnowledge, wipeKnowledge } = await import('@/lib/services/knowledge');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('[ingest] no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  if (wipe) {
    console.log('[ingest] wiping existing knowledge first');
    await wipeKnowledge(workspace.id, actorUserId);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  let totalChunks = 0;

  for (const file of docxFiles) {
    const section = sectionFromFilename(file);
    process.stdout.write(`  ${basename(file)} (§${section}) … `);
    try {
      const text = await readDocx(file);
      if (!text || text.trim().length < 60) {
        console.log('skipped (empty)');
        continue;
      }
      const result = await ingestKnowledge({
        workspaceId: workspace.id,
        actorUserId,
        section,
        version: stamp,
        text,
        metadata: { source: 'investor_pack', filename: basename(file) },
      });
      totalChunks += result.inserted;
      console.log(`${result.inserted} chunks`);
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[ingest] done — ${totalChunks} chunks across ${docxFiles.length} files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
