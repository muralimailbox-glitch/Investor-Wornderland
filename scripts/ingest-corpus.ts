/**
 * Walk the Investor Pack and Design Documents directories; route each file
 * to the matching extractor; ingest every chunk into knowledge_chunks for
 * the default workspace. Idempotent across runs via kb_ingest_log dedupe.
 *
 * Usage:
 *   pnpm tsx scripts/ingest-corpus.ts
 *   pnpm tsx scripts/ingest-corpus.ts --pack "../Investor Pack/All files V2"
 *   pnpm tsx scripts/ingest-corpus.ts --design "../Design Documents old"
 *   pnpm tsx scripts/ingest-corpus.ts --wipe  # wipe all KB first
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
  const { ingestKnowledge, wipeKnowledge } = await import('@/lib/services/knowledge');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('[corpus] no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  if (wipe) {
    console.log('[corpus] wiping existing knowledge first');
    await wipeKnowledge(workspace.id, actorUserId);
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

  let totalChunks = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of allFiles) {
    const ext = (file.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    const extractor = dispatch[ext];
    if (!extractor) continue;
    process.stdout.write(`  ${file.split(/[/\\]/).pop()} … `);
    try {
      const sections = await extractor(file);
      let chunks = 0;
      for (const sec of sections) {
        const hash = sha256(`${sec.source}::${sec.section}::${sec.text}`);
        if (await kbIngestLogRepo.hasContent(workspace.id, hash)) {
          skipped++;
          continue;
        }
        const result = await ingestKnowledge({
          workspaceId: workspace.id,
          actorUserId,
          section: sec.section,
          version: sec.version,
          text: sec.text,
          metadata: { ...(sec.metadata ?? {}), source: sec.source },
        });
        await kbIngestLogRepo.record({
          workspaceId: workspace.id,
          contentSha256: hash,
          source: sec.source,
          section: sec.section,
          chunkCount: result.inserted,
        });
        chunks += result.inserted;
      }
      totalChunks += chunks;
      console.log(`${chunks} chunks`);
    } catch (err) {
      failed++;
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[corpus] done — ${totalChunks} chunks, ${skipped} dedupe-skipped, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
