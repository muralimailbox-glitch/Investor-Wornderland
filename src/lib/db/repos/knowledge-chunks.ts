import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { knowledgeChunks } from '@/lib/db/schema';

export type KnowledgeChunkInsert = typeof knowledgeChunks.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;

export const knowledgeChunksRepo = {
  async insertMany(rows: KnowledgeChunkInsert[]) {
    if (rows.length === 0) return [];
    return db.insert(knowledgeChunks).values(rows).returning();
  },
  async wipeForWorkspace(workspaceId: string) {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.workspaceId, workspaceId));
  },
  async listForSection(workspaceId: string, section: string) {
    return db
      .select()
      .from(knowledgeChunks)
      .where(
        and(eq(knowledgeChunks.workspaceId, workspaceId), eq(knowledgeChunks.section, section)),
      );
  },
  async searchByEmbedding(
    workspaceId: string,
    queryEmbedding: number[],
    topK = 8,
    minSimilarity = 0.65,
  ) {
    const embeddingLiteral = `[${queryEmbedding.join(',')}]`;
    const rows = await db.execute<{
      id: string;
      section: string;
      version: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>(sql`
      SELECT id, section, version, content, metadata,
             1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
      FROM knowledge_chunks
      WHERE workspace_id = ${workspaceId}
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${topK}
    `);
    return rows.filter((r) => r.similarity >= minSimilarity);
  },
};
