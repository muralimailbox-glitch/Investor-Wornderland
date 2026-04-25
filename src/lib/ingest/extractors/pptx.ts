import { readFile } from 'node:fs/promises';

import {
  basenameOf,
  sectionFromFilename,
  type ExtractedSection,
} from '@/lib/ingest/extractors/types';

/**
 * Extract slide text + speaker notes from a .pptx. Uses office-parser which
 * shells out to nothing — pure JS XML parsing of the OOXML container.
 */
export async function extractPptx(filePath: string): Promise<ExtractedSection[]> {
  const op = (await import('officeparser')) as unknown as {
    default?: { parseOfficeAsync: (b: Buffer | string) => Promise<string> };
    parseOfficeAsync?: (b: Buffer | string) => Promise<string>;
  };
  const parser = op.default ?? op;
  if (!parser?.parseOfficeAsync) {
    throw new Error('officeparser.parseOfficeAsync not available');
  }
  const buffer = await readFile(filePath);
  const text = (await parser.parseOfficeAsync(buffer)).trim();
  if (text.length < 40) return [];
  return [
    {
      source: basenameOf(filePath),
      section: sectionFromFilename(filePath),
      version: 'v1',
      text,
      metadata: { format: 'pptx', filename: basenameOf(filePath) },
    },
  ];
}
