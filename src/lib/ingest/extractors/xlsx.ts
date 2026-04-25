import { readFileSync } from 'node:fs';

import {
  basenameOf,
  sectionFromFilename,
  type ExtractedSection,
} from '@/lib/ingest/extractors/types';

/**
 * Extract every sheet of an .xlsx as a markdown table per sheet, then concat
 * sheets into one section. Empty cells are stripped; rows that are entirely
 * empty are dropped.
 */
export async function extractXlsx(filePath: string): Promise<ExtractedSection[]> {
  const xlsxModule = await import('xlsx');
  const xlsx = (xlsxModule as unknown as { default?: typeof xlsxModule }).default ?? xlsxModule;
  const buffer = readFileSync(filePath);
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const baseSection = sectionFromFilename(filePath);

  const out: ExtractedSection[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rowsCsv: string[][] = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });
    const rows = rowsCsv
      .map((r) =>
        r.map((cell) =>
          cell == null ? '' : typeof cell === 'string' ? cell.trim() : String(cell),
        ),
      )
      .filter((r) => r.some((c) => c.length > 0));
    if (rows.length === 0) continue;

    const lines: string[] = [];
    lines.push(`## ${sheetName}`);
    for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
    const text = lines.join('\n');
    if (text.length < 40) continue;

    out.push({
      source: basenameOf(filePath),
      section: `${baseSection}_${sheetName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      version: 'v1',
      text,
      metadata: {
        format: 'xlsx',
        filename: basenameOf(filePath),
        sheet: sheetName,
      },
    });
  }
  return out;
}
