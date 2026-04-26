/**
 * Drafter endpoint — generates a grounded reply to an inbound investor email.
 *
 * Behaviour:
 *   1. Validate body (topic + optional inboundEmailId/leadId/context)
 *   2. Pull retrieval chunks from the workspace KB (top 6, MIN_SIMILARITY 0.45)
 *      to ground the reply in the founder's own writing.
 *   3. If a leadId is supplied, fetch the lead + investor for personalization.
 *   4. Call Claude (model resolved from env via getModel('drafter')) with the
 *      drafter prompt; expect strict JSON {subject, body, tone, intent,
 *      citedSections, suggestedNextStep, confidence}.
 *   5. Return parsed JSON to the caller. The caller decides whether to
 *      enqueue as a draft (status='draft' for the approval gate, rule #11)
 *      or paste into the compose-and-send route.
 *
 *   The previous version of this endpoint returned a hand-written placeholder.
 *   This commit wires it to the real central AI client.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { getModel, runMessage, type AiMessageParam } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatContextBlock, retrieve, type RetrievedChunk } from '@/lib/ai/retrieve';
import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { firms, investors, leads, users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  inboundEmailId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  topic: z.string().min(1).max(240),
  context: z.string().max(8000).optional(),
});

type ParsedDraft = {
  subject: string;
  body: string;
  tone?: string;
  intent?: string;
  citedSections?: string[];
  suggestedNextStep?: string;
  confidence?: number;
};

function tryParseJson(text: string): ParsedDraft | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as ParsedDraft;
    if (typeof parsed.subject === 'string' && typeof parsed.body === 'string') return parsed;
  } catch {
    // fall through to range extraction
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ParsedDraft;
      if (typeof parsed.subject === 'string' && typeof parsed.body === 'string') return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:reply', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  await checkCap(user.workspaceId).catch((err) => {
    if (err instanceof CapExceededError) {
      throw new ApiError(429, 'ai_cap_exceeded');
    }
    throw err;
  });

  // Lead + investor + firm context (only if leadId given)
  let investorContext: {
    firstName: string;
    lastName: string | null;
    firmName: string | null;
  } | null = null;
  if (body.leadId) {
    const [row] = await db
      .select({
        firstName: investors.firstName,
        lastName: investors.lastName,
        firmName: firms.name,
      })
      .from(leads)
      .innerJoin(investors, eq(investors.id, leads.investorId))
      .leftJoin(firms, eq(firms.id, investors.firmId))
      .where(and(eq(leads.id, body.leadId), eq(leads.workspaceId, user.workspaceId)))
      .limit(1);
    if (row) investorContext = row;
  }

  // Founder signature block
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

  // KB retrieval — same two-pass shape as the concierge so the reply stays
  // grounded even when the topic is novel.
  let chunks: RetrievedChunk[] = await retrieve(user.workspaceId, body.topic, {
    topK: 6,
    minSimilarity: 0.45,
  });
  if (chunks.length === 0) {
    chunks = await retrieve(user.workspaceId, body.topic, { topK: 10, minSimilarity: 0.3 });
  }

  const prompt = loadPrompt('drafter');
  const model = getModel('drafter');

  const sessionLines: string[] = [];
  if (investorContext) {
    sessionLines.push(`Investor first name: ${investorContext.firstName}.`);
    if (investorContext.firmName) sessionLines.push(`Investor firm: ${investorContext.firmName}.`);
  }
  if (body.context) sessionLines.push(`Operator-supplied context: ${body.context}`);
  sessionLines.push(`signature_block:\n${signatureBlock}`);

  const systemPrompt = [
    prompt.body,
    '',
    '## CONTEXT',
    chunks.length > 0 ? formatContextBlock(chunks) : '[no retrieved context]',
    '',
    '## SESSION',
    sessionLines.join('\n'),
  ].join('\n');

  const userMsg = `Topic / incoming email: ${body.topic}\n\nDraft the reply now (strict JSON only).`;

  const messages: AiMessageParam[] = [{ role: 'user', content: userMsg }];

  let result;
  try {
    result = await runMessage({
      workspaceId: user.workspaceId,
      agent: 'drafter',
      model,
      promptHash: prompt.hash,
      promptVersion: prompt.version,
      system: systemPrompt,
      messages,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature,
    });
  } catch (err) {
    if (err instanceof CapExceededError) throw new ApiError(429, 'ai_cap_exceeded');
    console.error('[draft.reply]', err);
    throw new ApiError(503, 'drafter_unavailable');
  }

  const parsed = tryParseJson(result.text);
  if (!parsed) {
    // Fallback: return the raw text as the body so the operator can still
    // edit something — better than failing the whole call.
    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'draft.reply.unparseable',
      targetType: body.inboundEmailId ? 'email_inbox' : 'lead',
      targetId: body.inboundEmailId ?? body.leadId ?? null,
      payload: { topic: body.topic, model: result.model, length: result.text.length },
    });
    return Response.json({
      subject: `Re: ${body.topic}`,
      bodyText: result.text,
      bodyHtml: null,
      citations: chunks.map((c) => ({ section: c.section, version: c.version })),
      placeholder: false,
      parseFailed: true,
      model: result.model,
    });
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.reply.generated',
    targetType: body.inboundEmailId ? 'email_inbox' : 'lead',
    targetId: body.inboundEmailId ?? body.leadId ?? null,
    payload: {
      topic: body.topic,
      model: result.model,
      tone: parsed.tone,
      intent: parsed.intent,
      confidence: parsed.confidence,
      suggestedNextStep: parsed.suggestedNextStep,
      citedSections: parsed.citedSections,
    },
  });

  return Response.json({
    subject: parsed.subject,
    bodyText: parsed.body,
    bodyHtml: null,
    citations: chunks.map((c) => ({
      section: c.section,
      version: c.version,
      similarity: Math.round(c.similarity * 1000) / 1000,
    })),
    tone: parsed.tone ?? null,
    intent: parsed.intent ?? null,
    suggestedNextStep: parsed.suggestedNextStep ?? null,
    confidence: parsed.confidence ?? null,
    placeholder: false,
    model: result.model,
  });
});
