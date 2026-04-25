import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { kbIngestLog } from '@/lib/db/schema';

export const kbIngestLogRepo = {
  async hasContent(workspaceId: string, contentSha256: string): Promise<boolean> {
    const rows = await db
      .select({ id: kbIngestLog.id })
      .from(kbIngestLog)
      .where(
        and(eq(kbIngestLog.workspaceId, workspaceId), eq(kbIngestLog.contentSha256, contentSha256)),
      )
      .limit(1);
    return rows.length > 0;
  },

  async record(input: {
    workspaceId: string;
    contentSha256: string;
    source: string;
    section: string;
    chunkCount: number;
  }) {
    await db
      .insert(kbIngestLog)
      .values(input)
      .onConflictDoNothing({
        target: [kbIngestLog.workspaceId, kbIngestLog.contentSha256],
      });
  },

  async hasSentinel(workspaceId: string, sentinel = '__bootstrap__'): Promise<boolean> {
    const rows = await db
      .select({ id: kbIngestLog.id })
      .from(kbIngestLog)
      .where(and(eq(kbIngestLog.workspaceId, workspaceId), eq(kbIngestLog.source, sentinel)))
      .limit(1);
    return rows.length > 0;
  },

  async writeSentinel(workspaceId: string, sentinel = '__bootstrap__') {
    await db
      .insert(kbIngestLog)
      .values({
        workspaceId,
        contentSha256: `sentinel-${sentinel}-${Date.now()}`,
        source: sentinel,
        section: sentinel,
        chunkCount: 0,
      })
      .onConflictDoNothing();
  },
};
