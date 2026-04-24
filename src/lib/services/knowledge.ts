import { embedBatch } from '@/lib/ai/embed';
import { audit } from '@/lib/audit';
import { knowledgeChunksRepo } from '@/lib/db/repos/knowledge-chunks';

export type KnowledgeIngestInput = {
  workspaceId: string;
  actorUserId: string;
  section: string;
  version: string;
  text: string;
  metadata?: Record<string, unknown>;
};

/** Semantic chunking: split on blank lines, glue adjacent short blocks. */
export function chunkText(text: string, target = 600, max = 900): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (para.length >= max) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      for (let i = 0; i < para.length; i += max) {
        chunks.push(para.slice(i, i + max).trim());
      }
      continue;
    }
    if ((current + '\n\n' + para).length > max) {
      chunks.push(current.trim());
      current = para;
    } else if (current.length >= target) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter((c) => c.length >= 40);
}

export async function ingestKnowledge(input: KnowledgeIngestInput) {
  const pieces = chunkText(input.text);
  if (pieces.length === 0) return { inserted: 0, chunks: [] };

  const embeddings = await embedBatch(pieces, 'passage');
  const rows = pieces.map((content, i) => ({
    workspaceId: input.workspaceId,
    section: input.section,
    version: input.version,
    content,
    embedding: embeddings[i]!,
    metadata: input.metadata ?? {},
  }));
  const inserted = await knowledgeChunksRepo.insertMany(rows);
  await audit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: 'knowledge.ingest',
    targetType: 'knowledge',
    targetId: `${input.section}.${input.version}`,
    payload: { chunks: inserted.length, section: input.section, version: input.version },
    ip: null,
    userAgent: null,
  });
  return { inserted: inserted.length, chunks: inserted };
}

export async function wipeKnowledge(workspaceId: string, actorUserId: string) {
  await knowledgeChunksRepo.wipeForWorkspace(workspaceId);
  await audit({
    workspaceId,
    actorUserId,
    action: 'knowledge.wipe',
    targetType: 'knowledge',
    targetId: 'all',
    payload: {},
    ip: null,
    userAgent: null,
  });
}
