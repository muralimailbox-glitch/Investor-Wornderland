import { embed } from '@/lib/ai/embed';
import { knowledgeChunksRepo, type KnowledgeChunk } from '@/lib/db/repos/knowledge-chunks';

export type RetrievedChunk = KnowledgeChunk & { similarity: number };

export const MIN_SIMILARITY = 0.65;

export async function retrieve(
  workspaceId: string,
  query: string,
  opts: { topK?: number; minSimilarity?: number } = {},
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query, 'query');
  const hits = await knowledgeChunksRepo.searchByEmbedding(
    workspaceId,
    queryEmbedding,
    opts.topK ?? 6,
    opts.minSimilarity ?? MIN_SIMILARITY,
  );
  return hits.map((h) => ({
    id: h.id,
    workspaceId,
    section: h.section,
    version: h.version,
    content: h.content,
    metadata: (h.metadata ?? {}) as Record<string, unknown>,
    embedding: [] as unknown as number[],
    createdAt: new Date(),
    similarity: h.similarity,
  }));
}

export function formatContextBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '[no context available]';
  return chunks.map((c) => `[§${c.section}.${c.version}]\n${c.content.trim()}`).join('\n\n---\n\n');
}
