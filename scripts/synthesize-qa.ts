/**
 * Synthesize 1000+ investor-tailored Q&A pairs grounded in the existing
 * knowledge_chunks table. Uses Claude Opus 4.7 via the central AI client.
 * Idempotent — resumable via .qa-progress.json. Writes each Q&A as a
 * knowledge_chunks row with section = "FAQ/<original-section>".
 *
 * Usage:
 *   pnpm tsx scripts/synthesize-qa.ts
 *   pnpm tsx scripts/synthesize-qa.ts --target 1000
 *   pnpm tsx scripts/synthesize-qa.ts --reset  # discard previous progress
 *
 * Cost: ~50 calls × (~6k in + ~3k out) tokens × Opus 4.7 ($15/$75 MTok) ≈ $15.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = Number.parseInt(flag('--target') ?? '1000', 10);
const reset = args.includes('--reset');
const perCall = Number.parseInt(flag('--per-call') ?? '20', 10);
const concurrency = Number.parseInt(flag('--concurrency') ?? '2', 10);

const PROGRESS_FILE = join(process.cwd(), '.qa-progress.json');

type Progress = {
  processedSections: string[];
  totalGenerated: number;
  totalIngested: number;
};

function loadProgress(): Progress {
  if (reset || !existsSync(PROGRESS_FILE)) {
    return { processedSections: [], totalGenerated: 0, totalIngested: 0 };
  }
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) as Progress;
  } catch {
    return { processedSections: [], totalGenerated: 0, totalIngested: 0 };
  }
}

function saveProgress(p: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function tryParseJson(text: string): unknown {
  // Strip markdown fences if model wrapped output despite the prompt.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Find the first { and last } and try again
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function main() {
  const { db } = await import('@/lib/db/client');
  const { knowledgeChunks } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { usersRepo } = await import('@/lib/db/repos/users');
  const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
  const { ingestKnowledge } = await import('@/lib/services/knowledge');
  const { runMessage } = await import('@/lib/ai/client');
  const { loadPrompt } = await import('@/lib/ai/prompts');
  const { embed } = await import('@/lib/ai/embed');
  const { sha256, dedupeByEmbedding } = await import('@/lib/ingest/dedupe');
  const pLimitMod = await import('p-limit');
  const pLimit = (pLimitMod as unknown as { default: typeof pLimitMod.default }).default;

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('[qa] no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  // Pull every chunk; group by section
  const allChunks = await db
    .select({
      section: knowledgeChunks.section,
      version: knowledgeChunks.version,
      content: knowledgeChunks.content,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.workspaceId, workspace.id));

  if (allChunks.length === 0) {
    console.error(
      '[qa] knowledge_chunks is empty — run `pnpm seed:knowledge` and `pnpm ingest:corpus` first',
    );
    process.exit(1);
  }

  const grouped = new Map<string, string[]>();
  for (const c of allChunks) {
    if (c.section.startsWith('FAQ/')) continue; // never feed FAQs back into the synthesizer
    const list = grouped.get(c.section) ?? [];
    list.push(c.content);
    grouped.set(c.section, list);
  }

  const progress = loadProgress();
  if (reset) saveProgress(progress);

  const sectionsToProcess = Array.from(grouped.keys()).filter(
    (s) => !progress.processedSections.includes(s),
  );
  console.log(
    `[qa] ${grouped.size} source sections, ${progress.processedSections.length} done previously, ${sectionsToProcess.length} remaining; target ${target}; per-call ${perCall}`,
  );

  const prompt = loadPrompt('faq-synth');
  const limit = pLimit(concurrency);

  type Pair = { q: string; a: string; sourceSection: string };
  const pendingPairs: Pair[] = [];

  // Multi-pass: cycle through sections until we hit target. Each section gets
  // at least one call; if we still need more, sections are revisited with a
  // higher creativity instruction (different topic flavor).
  const passes = ['first', 'follow_up_skeptical', 'follow_up_technical', 'follow_up_commercial'];
  let passIdx = 0;
  while (progress.totalIngested + pendingPairs.length < target) {
    const passLabel = passes[passIdx % passes.length] ?? 'first';
    const remaining = sectionsToProcess.filter(
      (s) => !progress.processedSections.includes(`${s}::${passLabel}`),
    );
    if (remaining.length === 0) {
      passIdx++;
      if (passIdx >= passes.length * 2) break; // safety cap
      continue;
    }

    const tasks = remaining.map((section) =>
      limit(async () => {
        const chunks = grouped.get(section) ?? [];
        const context = chunks.slice(0, 12).join('\n\n---\n\n').slice(0, 12000);
        const sys = `${prompt.body}\n\n## CONTEXT (section: ${section})\n${context}\n`;
        const userMsg = [
          `Generate ${perCall} investor Q&A pairs grounded ONLY in the CONTEXT above.`,
          passLabel === 'follow_up_skeptical'
            ? 'Bias the questions toward skeptical, push-back style — like a partner stress-testing the founder.'
            : passLabel === 'follow_up_technical'
              ? 'Bias the questions toward technical/architectural depth — like a CTO advisor reviewing the build.'
              : passLabel === 'follow_up_commercial'
                ? 'Bias the questions toward commercial/GTM/economics — like an operator partner testing unit economics.'
                : 'Cover a balanced spread.',
          'Output strict JSON. Each "a" must be answerable from CONTEXT alone.',
        ].join('\n');

        try {
          const resp = await withTimeout(
            runMessage({
              workspaceId: workspace.id,
              agent: 'curator',
              model: prompt.model,
              promptHash: prompt.hash,
              promptVersion: prompt.version,
              system: sys,
              messages: [{ role: 'user', content: userMsg }],
              maxTokens: prompt.maxTokens,
              temperature: prompt.temperature,
            }),
            60_000,
            `qa-synth(${section})`,
          );
          const parsed = tryParseJson(resp.text) as { qa?: Array<{ q: string; a: string }> } | null;
          const qa = parsed?.qa ?? [];
          if (qa.length === 0) {
            console.log(`  ${section} [${passLabel}] → 0 (parse failed)`);
            return;
          }
          for (const pair of qa) {
            if (
              !pair?.q ||
              !pair?.a ||
              pair.a.length < 40 ||
              /\bI don'?t\b|\bunclear\b|\bnot specified\b/i.test(pair.a)
            ) {
              continue;
            }
            pendingPairs.push({ q: pair.q.trim(), a: pair.a.trim(), sourceSection: section });
          }
          console.log(`  ${section} [${passLabel}] → ${qa.length} pairs`);
        } catch (err) {
          console.log(
            `  ${section} [${passLabel}] FAILED — ${err instanceof Error ? err.message : err}`,
          );
        } finally {
          progress.processedSections.push(`${section}::${passLabel}`);
          saveProgress(progress);
        }
      }),
    );
    await Promise.all(tasks);
    passIdx++;
  }

  console.log(`[qa] generated ${pendingPairs.length} candidate pairs; deduping…`);
  if (pendingPairs.length === 0) {
    console.log('[qa] nothing to ingest');
    return;
  }

  const questionEmbeds: number[][] = [];
  for (const pair of pendingPairs) {
    questionEmbeds.push(await embed(pair.q, 'query'));
  }
  const keepIdx = dedupeByEmbedding(questionEmbeds, 0.92);
  const finalPairs = keepIdx.map((i) => pendingPairs[i]!);
  console.log(`[qa] ${finalPairs.length} after dedupe; ingesting…`);

  let ingested = 0;
  for (const pair of finalPairs) {
    const section = `FAQ/${pair.sourceSection}`;
    const text = `Q: ${pair.q}\n\nA: ${pair.a}`;
    const hash = sha256(`faq::${section}::${text}`);
    if (await kbIngestLogRepo.hasContent(workspace.id, hash)) continue;
    const result = await ingestKnowledge({
      workspaceId: workspace.id,
      actorUserId,
      section,
      version: 'v1',
      text,
      metadata: { source: 'qa_synthesis', sourceSection: pair.sourceSection },
    });
    await kbIngestLogRepo.record({
      workspaceId: workspace.id,
      contentSha256: hash,
      source: 'qa_synthesis',
      section,
      chunkCount: result.inserted,
    });
    ingested += result.inserted;
  }
  progress.totalGenerated += pendingPairs.length;
  progress.totalIngested += ingested;
  saveProgress(progress);
  console.log(`[qa] done — ${ingested} chunks ingested (target ${target})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
