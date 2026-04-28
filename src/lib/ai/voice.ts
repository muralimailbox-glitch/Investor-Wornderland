/**
 * Founder voice corpus — small sample of the founder's actual sent emails
 * that we splice into compose / critique prompts so drafts match cadence
 * and tone instead of sounding like a generic LLM.
 *
 * Why this and not embeddings: at the OotaOS scale (tens to low-hundreds
 * of outbound emails) a 3-sample injection is enough signal for the model
 * to mimic style. Embeddings would mean a vector index + similarity hop
 * per draft — overkill until the corpus is in the thousands.
 *
 * The sampler is intentionally cheap:
 *   - selects the most-recent N sent rows
 *   - skips empty / template-only rows (nothing to learn from)
 *   - truncates each sample to MAX_SAMPLE_CHARS so total prompt size
 *     stays bounded
 *
 * Returns a single ready-to-include block. Empty string when no samples.
 */
import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailOutbox } from '@/lib/db/schema';

const MAX_SAMPLE_CHARS = 600;

export type VoiceSample = {
  subject: string;
  body: string;
  sentAt: string;
};

export async function getFounderVoiceSamples(
  workspaceId: string,
  count = 3,
): Promise<VoiceSample[]> {
  // Pull recent sent outbound rows. Filter out very short bodies (templated
  // boilerplate or status-only stubs) — they don't carry style signal.
  const rows = await db
    .select({
      subject: emailOutbox.subject,
      bodyText: emailOutbox.bodyText,
      sentAt: emailOutbox.sentAt,
    })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, workspaceId),
        eq(emailOutbox.status, 'sent'),
        sql`length(${emailOutbox.bodyText}) > 200`,
      ),
    )
    .orderBy(desc(emailOutbox.sentAt))
    .limit(count * 4); // over-fetch so the dedupe step has room to work

  // De-dup near-identical bodies — the same template fired at multiple
  // recipients adds zero new style signal.
  const seenPrefixes = new Set<string>();
  const samples: VoiceSample[] = [];
  for (const r of rows) {
    if (!r.bodyText) continue;
    const prefix = r.bodyText.slice(0, 80).replace(/\s+/g, ' ').trim();
    if (seenPrefixes.has(prefix)) continue;
    seenPrefixes.add(prefix);

    samples.push({
      subject: r.subject,
      body: r.bodyText.slice(0, MAX_SAMPLE_CHARS),
      sentAt: r.sentAt ? r.sentAt.toISOString() : '',
    });
    if (samples.length >= count) break;
  }
  return samples;
}

/**
 * Render the samples as a single prompt block. Empty string when no
 * samples — the caller's prompt template should still work without it.
 */
export function formatVoiceBlock(samples: VoiceSample[]): string {
  if (samples.length === 0) return '';
  const blocks = samples.map((s, i) => {
    const subjectLine = s.subject ? `Subject: ${s.subject}` : '';
    return [
      `### Sample ${i + 1}${s.sentAt ? ` (${s.sentAt.slice(0, 10)})` : ''}`,
      subjectLine,
      s.body,
    ]
      .filter(Boolean)
      .join('\n');
  });
  return [
    '## FOUNDER VOICE SAMPLES',
    'Use these as a reference for cadence, vocabulary, and pacing. Match',
    'them — do not paraphrase, do not over-formal them, do not be',
    'breezier than they are.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
