/**
 * Walk the Investor Pack and Design Documents directories; route each file
 * to the matching extractor; ingest with **replace-by-source** semantics —
 * if a file's content hash differs from the previous ingest, all of its
 * chunks are wiped and replaced atomically. If the hash matches, the file
 * is skipped. Files that have been removed from disk are NOT auto-deleted
 * from the KB unless `--prune-missing` is passed.
 *
 * Cascades: when a source's chunks change, every FAQ chunk whose
 * `metadata.sourceFile` points at this source is also wiped, so the next
 * Q&A synthesis run regenerates them against the fresh content.
 *
 * Usage:
 *   pnpm tsx scripts/ingest-corpus.ts
 *   pnpm tsx scripts/ingest-corpus.ts --pack "../Investor Pack/All files V2"
 *   pnpm tsx scripts/ingest-corpus.ts --design "../Design Documents old"
 *   pnpm tsx scripts/ingest-corpus.ts --wipe          # wipe ALL KB first
 *   pnpm tsx scripts/ingest-corpus.ts --prune-missing # delete chunks for files no longer on disk
 *
 * Supported extensions: .docx, .xlsx, .pptx, .md, .pdf
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const wipe = args.includes('--wipe');
const pruneMissing = args.includes('--prune-missing');
const packDir = flag('--pack') ?? '../Investor Pack/All files V2';
const designDir = flag('--design') ?? '../Design Documents old';

type Extractor = (file: string) => Promise<
  Array<{
    source: string;
    section: string;
    version: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>
>;

function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .map((f) => join(dir, f))
      .filter((f) => {
        try {
          return statSync(f).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

async function main() {
  const { extractDocx } = await import('@/lib/ingest/extractors/docx');
  const { extractXlsx } = await import('@/lib/ingest/extractors/xlsx');
  const { extractPptx } = await import('@/lib/ingest/extractors/pptx');
  const { extractMd } = await import('@/lib/ingest/extractors/md');
  const { extractPdf } = await import('@/lib/ingest/extractors/pdf');
  const { sha256 } = await import('@/lib/ingest/dedupe');
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { usersRepo } = await import('@/lib/db/repos/users');
  const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
  const { knowledgeChunksRepo } = await import('@/lib/db/repos/knowledge-chunks');
  const { ingestKnowledge, wipeKnowledge } = await import('@/lib/services/knowledge');
  const { db } = await import('@/lib/db/client');
  const { kbIngestLog } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('[corpus] no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  if (wipe) {
    console.log('[corpus] --wipe: clearing all knowledge_chunks first');
    await wipeKnowledge(workspace.id, actorUserId);
    // Also clear log so the next pass reseeds everything
    await db.delete(kbIngestLog).where(eq(kbIngestLog.workspaceId, workspace.id));
  }

  const dispatch: Record<string, Extractor> = {
    '.docx': extractDocx,
    '.xlsx': extractXlsx,
    '.pptx': extractPptx,
    '.md': extractMd,
    '.pdf': extractPdf,
  };

  const allFiles = [
    ...listFiles(resolve(process.cwd(), packDir)),
    ...listFiles(resolve(process.cwd(), designDir)),
  ];
  if (allFiles.length === 0) {
    console.warn(`[corpus] no files found under ${packDir} or ${designDir}`);
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let inserted = 0;
  let totalChunks = 0;
  let failed = 0;
  const seenSources = new Set<string>();

  for (const file of allFiles) {
    const ext = (file.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    const extractor = dispatch[ext];
    if (!extractor) continue;
    const fname = basename(file);
    seenSources.add(fname);
    process.stdout.write(`  ${fname} … `);
    try {
      const sections = await extractor(file);
      if (sections.length === 0) {
        console.log('skipped (empty)');
        continue;
      }
      // Combine all sections from this file into one hash so any change
      // anywhere in the file triggers a full file re-ingest.
      const combinedText = sections.map((s) => `§${s.section}\n${s.text}`).join('\n\n');
      const hash = sha256(`${fname}::${combinedText}`);

      const existing = await kbIngestLogRepo.getBySource(workspace.id, fname);
      if (existing && existing.contentSha256 === hash) {
        unchanged++;
        console.log('unchanged');
        continue;
      }

      // Wipe stale chunks for this source AND any FAQs derived from it
      if (existing) {
        await knowledgeChunksRepo.wipeBySource(workspace.id, fname);
        await knowledgeChunksRepo.wipeBySourceFile(workspace.id, fname);
      }

      let chunkCount = 0;
      for (const sec of sections) {
        const result = await ingestKnowledge({
          workspaceId: workspace.id,
          actorUserId,
          section: sec.section,
          version: sec.version,
          text: sec.text,
          metadata: { ...(sec.metadata ?? {}), source: fname },
        });
        chunkCount += result.inserted;
      }
      await kbIngestLogRepo.upsertSource({
        workspaceId: workspace.id,
        source: fname,
        section: sections[0]?.section ?? 'unknown',
        contentSha256: hash,
        chunkCount,
      });
      totalChunks += chunkCount;
      if (existing) {
        updated++;
        console.log(`updated → ${chunkCount} chunks (was ${existing.chunkCount})`);
      } else {
        inserted++;
        console.log(`new → ${chunkCount} chunks`);
      }
    } catch (err) {
      failed++;
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  if (pruneMissing) {
    const allLogged = await db
      .select({ source: kbIngestLog.source })
      .from(kbIngestLog)
      .where(eq(kbIngestLog.workspaceId, workspace.id));
    const orphans = allLogged
      .map((r) => r.source)
      .filter(
        (s) =>
          !s.startsWith('__') &&
          !s.startsWith('http') &&
          s !== 'qa_synthesis' &&
          !seenSources.has(s),
      );
    for (const orphan of orphans) {
      await knowledgeChunksRepo.wipeBySource(workspace.id, orphan);
      await knowledgeChunksRepo.wipeBySourceFile(workspace.id, orphan);
      await kbIngestLogRepo.deleteSource(workspace.id, orphan);
      console.log(`  pruned ${orphan} (no longer on disk)`);
    }
  }

  console.log(
    `[corpus] done — ${inserted} new, ${updated} updated, ${unchanged} unchanged, ${failed} failed; ${totalChunks} total new/updated chunks`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
