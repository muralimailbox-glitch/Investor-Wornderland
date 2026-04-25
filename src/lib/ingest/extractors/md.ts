import { readFile } from 'node:fs/promises';

import {
  basenameOf,
  sectionFromFilename,
  type ExtractedSection,
} from '@/lib/ingest/extractors/types';

/**
 * Read a markdown file. Strip YAML frontmatter if present. Treat the
 * whole file as one section — chunkText() inside ingestKnowledge will
 * split it on blank lines.
 */
export async function extractMd(filePath: string): Promise<ExtractedSection[]> {
  const raw = await readFile(filePath, 'utf8');
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n+/, '').trim();
  if (stripped.length < 40) return [];
  return [
    {
      source: basenameOf(filePath),
      section: sectionFromFilename(filePath),
      version: 'v1',
      text: stripped,
      metadata: { format: 'md', filename: basenameOf(filePath) },
    },
  ];
}
