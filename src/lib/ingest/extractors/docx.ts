import { readFileSync } from 'node:fs';

import {
  basenameOf,
  sectionFromFilename,
  type ExtractedSection,
} from '@/lib/ingest/extractors/types';

export async function extractDocx(filePath: string): Promise<ExtractedSection[]> {
  const mammoth = await import('mammoth');
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value ?? '').trim();
  if (text.length < 40) return [];
  return [
    {
      source: basenameOf(filePath),
      section: sectionFromFilename(filePath),
      version: 'v1',
      text,
      metadata: { format: 'docx', filename: basenameOf(filePath) },
    },
  ];
}
