/**
 * Dry-run the corpus extractors against the actual Investor Pack and
 * Design Documents directories. Writes nothing to DB. Prints, per file,
 * the format, chunk count, character count, and a 400-char preview so
 * we can confirm the extractors are getting clean text before ingesting.
 *
 * Usage:
 *   pnpm tsx scripts/preview-extractors.ts
 *   pnpm tsx scripts/preview-extractors.ts --pack "../Investor Pack/All files V2"
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
const packDir = flag('--pack') ?? '../Investor Pack/All files V2';
const designDir = flag('--design') ?? '../Design Documents old';

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

  const dispatch: Record<string, (f: string) => Promise<unknown>> = {
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
    console.error(`no files under ${packDir} or ${designDir}`);
    process.exit(1);
  }

  let totalSections = 0;
  let totalChars = 0;
  for (const file of allFiles) {
    const ext = (file.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    const extractor = dispatch[ext];
    if (!extractor) continue;
    const fname = file.split(/[/\\]/).pop();
    try {
      const sections = (await extractor(file)) as Array<{
        section: string;
        text: string;
        metadata?: Record<string, unknown>;
      }>;
      const totalLen = sections.reduce((n, s) => n + s.text.length, 0);
      totalSections += sections.length;
      totalChars += totalLen;
      console.log(`\n── ${fname}  (${ext}, ${sections.length} sections, ${totalLen} chars) ──`);
      for (const sec of sections) {
        const preview = sec.text.slice(0, 400).replace(/\s+/g, ' ');
        console.log(`  §${sec.section}: ${preview}${sec.text.length > 400 ? ' …' : ''}`);
      }
    } catch (err) {
      console.log(`\n── ${fname}  FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n== summary: ${totalSections} sections, ${totalChars} total chars ==`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
