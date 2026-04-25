import { readFile } from 'node:fs/promises';

import {
  basenameOf,
  sectionFromFilename,
  type ExtractedSection,
} from '@/lib/ingest/extractors/types';

export async function extractPdf(filePath: string): Promise<ExtractedSection[]> {
  // pdf-parse defaults to a CJS export; access via .default when present
  const mod = (await import('pdf-parse')) as unknown as {
    default?: (b: Buffer) => Promise<{ text: string }>;
  };
  const parse = mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
  const buffer = await readFile(filePath);
  const result = await parse(buffer);
  const text = (result.text ?? '').trim();
  if (text.length < 40) return [];
  return [
    {
      source: basenameOf(filePath),
      section: sectionFromFilename(filePath),
      version: 'v1',
      text,
      metadata: { format: 'pdf', filename: basenameOf(filePath) },
    },
  ];
}
