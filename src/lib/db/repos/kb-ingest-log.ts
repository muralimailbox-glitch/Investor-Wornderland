import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { kbIngestLog } from '@/lib/db/schema';

export const kbIngestLogRepo = {
  /** Look up the recorded hash for a source. Returns null if never ingested. */
  async getBySource(
    workspaceId: string,
    source: string,
  ): Promise<{ contentSha256: string; section: string; chunkCount: number } | null> {
    const rows = await db
      .select({
        contentSha256: kbIngestLog.contentSha256,
        section: kbIngestLog.section,
        chunkCount: kbIngestLog.chunkCount,
      })
      .from(kbIngestLog)
      .where(and(eq(kbIngestLog.workspaceId, workspaceId), eq(kbIngestLog.source, source)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Idempotent upsert keyed by (workspace, source). */
  async upsertSource(input: {
    workspaceId: string;
    source: string;
    section: string;
    contentSha256: string;
    chunkCount: number;
  }) {
    await db
      .insert(kbIngestLog)
      .values(input)
      .onConflictDoUpdate({
        target: [kbIngestLog.workspaceId, kbIngestLog.source],
        set: {
          contentSha256: input.contentSha256,
          section: input.section,
          chunkCount: input.chunkCount,
          ingestedAt: new Date(),
        },
      });
  },

  async deleteSource(workspaceId: string, source: string) {
    await db
      .delete(kbIngestLog)
      .where(and(eq(kbIngestLog.workspaceId, workspaceId), eq(kbIngestLog.source, source)));
  },

  async hasSentinel(workspaceId: string, sentinel = '__bootstrap__'): Promise<boolean> {
    const row = await this.getBySource(workspaceId, sentinel);
    return row !== null;
  },

  async writeSentinel(workspaceId: string, sentinel = '__bootstrap__') {
    await this.upsertSource({
      workspaceId,
      source: sentinel,
      section: sentinel,
      contentSha256: `sentinel-${Date.now()}`,
      chunkCount: 0,
    });
  },
};
