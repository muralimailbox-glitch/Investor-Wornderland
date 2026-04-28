/**
 * AI-assisted email composition for outbound founder→investor messages.
 *
 * Distinct from /api/v1/admin/draft/reply which generates a *reply* to an
 * inbound. This endpoint generates an *outbound* draft from scratch with
 * full investor context: their interaction history, warmth score, sector
 * focus, fit rationale, the firm's portfolio companies (when imported
 * from Tracxn), and the founder's signature.
 *
 * Inputs (all optional except leadIds):
 *   - leadIds: string[]   - one draft per lead, returned in same order
 *   - intent: enum        - shapes the prompt (intro / follow_up / share_doc /
 *                            schedule_meeting / nudge_after_silence / thank_you /
 *                            custom)
 *   - tone: enum          - warm | formal | concise (default warm)
 *   - operatorContext     - free text the founder wants the model to weave in
 *                            ("we just closed Series A bridge", "saw their
 *                             investment in Mysa", etc.)
 *
 * Returns: { drafts: Array<{leadId, subject, body, citations, provenance,
 *           tone, intent, suggestedNextStep, confidence}> }
 *
 * Always grounds in the workspace KB via retrieve(). Always pulls the last
 * 10 interactions per lead so the model knows what's already been said.
 * The provenance line tells the founder exactly which signals went into
 * the draft so they trust the output.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { getModel, runMessage, type AiMessageParam } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatContextBlock, retrieve, type RetrievedChunk } from '@/lib/ai/retrieve';
import { formatVoiceBlock, getFounderVoiceSamples } from '@/lib/ai/voice';
import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { firms, interactions, investors, leads, users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept either leadIds (when the caller already has them — bulk-email-modal)
// or investorIds (when the caller only has the investor — invite-link-modal,
// individual cockpit screens). Server resolves the active lead per investor.
const Body = z
  .object({
    leadIds: z.array(z.string().uuid()).max(20).optional(),
    investorIds: z.array(z.string().uuid()).max(20).optional(),
    intent: z
      .enum([
        'intro',
        'follow_up',
        'share_doc',
        'schedule_meeting',
        'nudge_after_silence',
        'thank_you',
        'custom',
      ])
      .default('intro'),
    tone: z.enum(['warm', 'formal', 'concise']).default('warm'),
    operatorContext: z.string().max(2000).optional(),
  })
  .refine(
    (b) => (b.leadIds && b.leadIds.length > 0) || (b.investorIds && b.investorIds.length > 0),
    { message: 'leadIds or investorIds required' },
  );

type DraftOutput = {
  leadId: string;
  investorId: string;
  email: string;
  firstName: string;
  firmName: string | null;
  subject: string;
  body: string;
  citations: Array<{ section: string; version: string; similarity?: number }>;
  provenance: {
    interactionsConsidered: number;
    sectorsKnown: number;
    portfolioCompaniesKnown: number;
    fitRationaleAvailable: boolean;
    warmthScore: number | null;
    kbChunks: number;
    voiceSamples: number;
  };
  tone?: string;
  intent?: string;
  suggestedNextStep?: string;
  confidence?: number;
};

function tryParseJson(text: string): {
  subject?: string;
  body?: string;
  tone?: string;
  intent?: string;
  citedSections?: string[];
  suggestedNextStep?: string;
  confidence?: number;
} | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // try to find first {...} in the text
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

function buildPromptForIntent(
  intent: z.infer<typeof Body>['intent'],
  tone: z.infer<typeof Body>['tone'],
): string {
  const toneLine =
    tone === 'warm'
      ? 'Tone: warm and personal. Like a founder talking to a respected peer.'
      : tone === 'formal'
        ? 'Tone: professional and polished. Suitable for a first-touch outbound.'
        : 'Tone: concise and direct. No fluff. Founders are busy.';

  const intentLine =
    {
      intro: 'Intent: cold/warm intro to OotaOS. Hook with their stated focus.',
      follow_up: 'Intent: follow up on a previous touch. Reference specifics.',
      share_doc: 'Intent: share a specific document and tee up a meeting.',
      schedule_meeting: 'Intent: ask for 30 min on the founder calendar.',
      nudge_after_silence:
        'Intent: gentle nudge after >2 weeks of silence. Add new info, not pressure.',
      thank_you: 'Intent: thank them for time/intro/feedback. Close the loop.',
      custom: 'Intent: follow the operator-supplied context exactly.',
    }[intent] ?? 'Intent: outbound founder email.';

  return [
    'You are drafting an outbound email from the OotaOS founder to a specific investor.',
    intentLine,
    toneLine,
    'Personalize using their portfolio, sector focus, and fit rationale when supplied.',
    'Reference past interactions if any — never repeat what was already said.',
    'If the investor has signalled disinterest in past interactions, flag this in the suggestedNextStep.',
    'Always include a clear call-to-action and a single magic-link CTA placeholder {{investorLink}}.',
    'Output STRICT JSON: {subject, body, tone, intent, citedSections, suggestedNextStep, confidence}.',
    'subject: ≤80 chars. body: 3-5 short paragraphs, no signature block (the system appends it).',
    'suggestedNextStep one of: book_meeting | share_doc | wait | escalate_to_founder.',
    'confidence: float 0..1.',
  ].join('\n');
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:compose', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  await checkCap(user.workspaceId).catch((err) => {
    if (err instanceof CapExceededError) throw new ApiError(429, 'ai_cap_exceeded');
    throw err;
  });

  // Resolve the active lead per investor when the caller passed investorIds.
  // "Active" = most-recently-touched lead per investor. The compose draft
  // attaches to that lead so downstream interaction logging stays coherent.
  let resolvedLeadIds: string[];
  if (body.leadIds && body.leadIds.length > 0) {
    resolvedLeadIds = body.leadIds;
  } else if (body.investorIds && body.investorIds.length > 0) {
    const leadsForInvestors = await db
      .select({
        id: leads.id,
        investorId: leads.investorId,
        stageEnteredAt: leads.stageEnteredAt,
      })
      .from(leads)
      .where(
        and(eq(leads.workspaceId, user.workspaceId), inArray(leads.investorId, body.investorIds)),
      )
      .orderBy(desc(leads.stageEnteredAt));
    const seen = new Set<string>();
    resolvedLeadIds = [];
    for (const l of leadsForInvestors) {
      if (seen.has(l.investorId)) continue;
      seen.add(l.investorId);
      resolvedLeadIds.push(l.id);
    }
    if (resolvedLeadIds.length === 0) throw new ApiError(404, 'no_active_lead_for_investor');
  } else {
    throw new ApiError(400, 'no_targets');
  }

  // Load every lead + investor + firm in one shot.
  const rows = await db
    .select({
      leadId: leads.id,
      stage: leads.stage,
      lastContactAt: leads.lastContactAt,
      investorId: investors.id,
      firstName: investors.firstName,
      lastName: investors.lastName,
      email: investors.email,
      title: investors.title,
      warmthScore: investors.warmthScore,
      sectorInterests: investors.sectorInterests,
      stageInterests: investors.stageInterests,
      bioSummary: investors.bioSummary,
      fitRationale: investors.fitRationale,
      pastInvestments: investors.pastInvestments,
      tracxnUrl: investors.tracxnUrl,
      firmId: firms.id,
      firmName: firms.name,
      firmType: firms.firmType,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(eq(leads.workspaceId, user.workspaceId), inArray(leads.id, resolvedLeadIds)));

  if (rows.length === 0) throw new ApiError(404, 'no_matching_leads');

  // Recent interactions per lead (last 10 each, ordered new→old).
  const interactionRows = await db
    .select({
      leadId: interactions.leadId,
      kind: interactions.kind,
      payload: interactions.payload,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.workspaceId, user.workspaceId),
        inArray(
          interactions.leadId,
          rows.map((r) => r.leadId),
        ),
      ),
    )
    .orderBy(desc(interactions.createdAt))
    .limit(rows.length * 10);

  const interactionsByLead = new Map<string, typeof interactionRows>();
  for (const it of interactionRows) {
    if (!it.leadId) continue;
    const arr = interactionsByLead.get(it.leadId) ?? [];
    if (arr.length < 10) {
      arr.push(it);
      interactionsByLead.set(it.leadId, arr);
    }
  }

  // Founder signature.
  const [founder] = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      signatureMarkdown: users.signatureMarkdown,
      companyName: users.companyName,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const signatureBlock =
    founder?.signatureMarkdown ??
    `${founder?.displayName ?? 'Murali'}\n${founder?.companyName ?? 'OotaOS'}\n${founder?.email ?? ''}`;

  const prompt = loadPrompt('drafter');
  const model = getModel('drafter');
  const systemPrompt = buildPromptForIntent(body.intent, body.tone);

  // KB retrieval for the operator's free-text context (or the intent itself
  // if no operator context). Reused across all leads in this batch — same
  // OotaOS knowledge applies; per-lead variation is via the investor block.
  const queryString = body.operatorContext?.slice(0, 1500) ?? `${body.intent} outbound email`;
  let chunks: RetrievedChunk[] = await retrieve(user.workspaceId, queryString, {
    topK: 6,
    minSimilarity: 0.4,
  });
  if (chunks.length === 0) {
    chunks = await retrieve(user.workspaceId, queryString, { topK: 10, minSimilarity: 0.25 });
  }
  const kbBlock = chunks.length > 0 ? formatContextBlock(chunks) : '[no retrieved context]';

  // Voice samples — last 3 substantive sent emails. Spliced into every
  // draft below so the model mimics the founder's actual cadence rather
  // than producing generic LLM prose.
  const voiceSamples = await getFounderVoiceSamples(user.workspaceId, 3);
  const voiceBlock = formatVoiceBlock(voiceSamples);

  const drafts: DraftOutput[] = [];
  for (const r of rows) {
    const itList = interactionsByLead.get(r.leadId) ?? [];
    const portfolioCount = Array.isArray(r.pastInvestments) ? r.pastInvestments.length : 0;
    const sectorCount = r.sectorInterests?.length ?? 0;

    const investorBlock = [
      `firstName=${r.firstName}`,
      `firm=${r.firmName ?? '(unknown firm)'}`,
      `firmType=${r.firmType ?? '(unknown)'}`,
      r.warmthScore != null ? `warmthScore=${r.warmthScore}` : null,
      r.sectorInterests && r.sectorInterests.length > 0
        ? `sectorFocus=${r.sectorInterests.join(', ')}`
        : null,
      r.stageInterests && r.stageInterests.length > 0
        ? `stageFocus=${r.stageInterests.join(', ')}`
        : null,
      r.fitRationale ? `fitRationale=${r.fitRationale}` : null,
      r.bioSummary ? `bio=${r.bioSummary.slice(0, 400)}` : null,
      portfolioCount > 0
        ? `portfolio=${JSON.stringify((r.pastInvestments as unknown[]).slice(0, 6))}`
        : null,
      `currentStage=${r.stage}`,
      r.lastContactAt ? `lastContactAt=${r.lastContactAt.toISOString()}` : 'lastContactAt=never',
    ]
      .filter(Boolean)
      .join('\n');

    const interactionsBlock =
      itList.length === 0
        ? '(no prior interactions)'
        : itList
            .map((it) => {
              const when = it.createdAt.toISOString().slice(0, 10);
              const summary =
                typeof it.payload === 'object' && it.payload !== null
                  ? JSON.stringify(it.payload).slice(0, 200)
                  : '';
              return `${when} ${it.kind}: ${summary}`;
            })
            .join('\n');

    const userPayload = [
      '## INVESTOR',
      investorBlock,
      '',
      '## RECENT INTERACTIONS (last 10, newest first)',
      interactionsBlock,
      '',
      '## OPERATOR CONTEXT',
      body.operatorContext ?? '(none)',
      '',
      '## OOTAOS KNOWLEDGE BASE',
      kbBlock,
      '',
      voiceBlock ||
        '## FOUNDER VOICE SAMPLES\n(no past sent emails on file yet — use neutral founder voice)',
      '',
      '## FOUNDER SIGNATURE (do NOT include verbatim — system appends it)',
      signatureBlock,
      '',
      'Draft the outbound email now. Strict JSON only.',
    ].join('\n');

    let result;
    try {
      result = await runMessage({
        workspaceId: user.workspaceId,
        agent: 'drafter',
        model,
        promptHash: prompt.hash,
        promptVersion: prompt.version,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPayload }] satisfies AiMessageParam[],
        maxTokens: prompt.maxTokens,
        temperature: prompt.temperature,
      });
    } catch (err) {
      if (err instanceof CapExceededError) throw new ApiError(429, 'ai_cap_exceeded');
      console.error('[draft.compose]', err);
      // Skip this lead, continue with others.
      drafts.push({
        leadId: r.leadId,
        investorId: r.investorId,
        email: r.email,
        firstName: r.firstName,
        firmName: r.firmName,
        subject: '',
        body: `[ai_unavailable] Draft generation failed for ${r.firstName}. Compose manually or retry.`,
        citations: [],
        provenance: {
          interactionsConsidered: itList.length,
          sectorsKnown: sectorCount,
          portfolioCompaniesKnown: portfolioCount,
          fitRationaleAvailable: Boolean(r.fitRationale),
          warmthScore: r.warmthScore,
          kbChunks: chunks.length,
          voiceSamples: voiceSamples.length,
        },
      });
      continue;
    }

    const parsed = tryParseJson(result.text);
    drafts.push({
      leadId: r.leadId,
      investorId: r.investorId,
      email: r.email,
      firstName: r.firstName,
      firmName: r.firmName,
      subject: parsed?.subject ?? `Re: ${body.intent}`,
      body: parsed?.body ?? result.text.trim(),
      citations: chunks.map((c) => ({
        section: c.section,
        version: c.version,
        similarity: Math.round(c.similarity * 1000) / 1000,
      })),
      provenance: {
        interactionsConsidered: itList.length,
        sectorsKnown: sectorCount,
        portfolioCompaniesKnown: portfolioCount,
        fitRationaleAvailable: Boolean(r.fitRationale),
        warmthScore: r.warmthScore,
        kbChunks: chunks.length,
        voiceSamples: voiceSamples.length,
      },
      ...(parsed?.tone ? { tone: parsed.tone } : {}),
      ...(parsed?.intent ? { intent: parsed.intent } : {}),
      ...(parsed?.suggestedNextStep ? { suggestedNextStep: parsed.suggestedNextStep } : {}),
      ...(parsed?.confidence != null ? { confidence: parsed.confidence } : {}),
    });
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.compose.batch',
    targetType: 'leads',
    payload: {
      leadCount: rows.length,
      intent: body.intent,
      tone: body.tone,
      hasOperatorContext: Boolean(body.operatorContext),
    },
  });

  return Response.json({ drafts });
});
