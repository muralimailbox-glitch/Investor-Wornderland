/**
 * Real-time draft critique. Cheap, opinionated lint over an in-progress
 * outbound email. Surfaces issues as a typed list that the cockpit
 * renders as inline pills above the textarea.
 *
 *   POST /api/v1/admin/draft/critique
 *   { subject, body, leadId? | investorId? }
 *
 * Returns: { issues: Array<{kind, severity, message}> }
 *
 * Two pass strategy:
 *   1. Heuristic checks first — no AI cost, sub-millisecond:
 *        - empty subject / empty body
 *        - missing salutation
 *        - missing CTA / link
 *        - body too long (>2500 chars)
 *        - "to be honest" / "honestly" filler
 *        - no first-name personalization token
 *   2. If a leadId/investorId is present and the body is non-trivial,
 *      do a single short Claude call asking for issues only — no rewrite.
 *      Capped at 2 critiques per minute per founder so the typing-aware
 *      caller (debounced 500ms) doesn't burn budget.
 *
 * Designed for low-latency: target p95 < 1.2s including the AI hop.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { getModel, runMessage, type AiMessageParam } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatVoiceBlock, getFounderVoiceSamples } from '@/lib/ai/voice';
import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { firms, investors, leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(8000),
  leadId: z.string().uuid().optional(),
  investorId: z.string().uuid().optional(),
});

type IssueKind =
  | 'empty_subject'
  | 'empty_body'
  | 'missing_salutation'
  | 'missing_cta'
  | 'too_long'
  | 'filler'
  | 'no_personalization'
  | 'no_portfolio_reference'
  | 'name_mismatch'
  | 'tone_shift'
  | 'investor_already_passed'
  | 'kb_drift';

type Severity = 'info' | 'warn' | 'error';

type Issue = { kind: IssueKind; severity: Severity; message: string };

const FILLER_RE =
  /\b(to be honest|honestly|literally|just wanted to|i hope this finds you well)\b/i;

function heuristicChecks(
  input: { subject?: string | undefined; body: string },
  name: string | null,
): Issue[] {
  const issues: Issue[] = [];
  if (!input.subject || input.subject.trim().length === 0) {
    issues.push({
      kind: 'empty_subject',
      severity: 'error',
      message: 'Subject is empty.',
    });
  }
  const trimmed = input.body.trim();
  if (trimmed.length === 0) {
    issues.push({ kind: 'empty_body', severity: 'error', message: 'Body is empty.' });
    return issues;
  }
  if (!/^(hi|hello|hey|dear|namaste)\b/i.test(trimmed)) {
    issues.push({
      kind: 'missing_salutation',
      severity: 'warn',
      message: 'No salutation — most VCs skim the first line.',
    });
  }
  if (!/{{investorLink}}|https?:\/\//i.test(trimmed)) {
    issues.push({
      kind: 'missing_cta',
      severity: 'warn',
      message: 'No call-to-action / link. Consider including {{investorLink}}.',
    });
  }
  if (trimmed.length > 2500) {
    issues.push({
      kind: 'too_long',
      severity: 'warn',
      message: `Body is ${trimmed.length} chars. Investors skim — aim for <1500.`,
    });
  }
  if (FILLER_RE.test(trimmed)) {
    issues.push({
      kind: 'filler',
      severity: 'info',
      message: 'Filler phrase detected ("to be honest" / "I hope this finds you well"). Cut it.',
    });
  }
  if (!/{{firstName}}|{{firmName}}/.test(trimmed)) {
    issues.push({
      kind: 'no_personalization',
      severity: 'warn',
      message:
        'No personalization token. Add {{firstName}} or {{firmName}} so each recipient feels addressed.',
    });
  }
  if (
    name &&
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(trimmed)
  ) {
    issues.push({
      kind: 'name_mismatch',
      severity: 'warn',
      message: `You hard-coded "${name}" — bulk-send will sign every recipient as ${name}. Use {{firstName}}.`,
    });
  }
  return issues;
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:critique', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  // Resolve investor context if a leadId/investorId is supplied.
  let firstName: string | null = null;
  let firmName: string | null = null;
  let warmthScore: number | null = null;
  let portfolioCount = 0;
  let stage: string | null = null;
  if (body.leadId || body.investorId) {
    let row;
    if (body.leadId) {
      [row] = await db
        .select({
          firstName: investors.firstName,
          firmName: firms.name,
          warmthScore: investors.warmthScore,
          pastInvestments: investors.pastInvestments,
          stage: leads.stage,
        })
        .from(leads)
        .innerJoin(investors, eq(investors.id, leads.investorId))
        .leftJoin(firms, eq(firms.id, investors.firmId))
        .where(and(eq(leads.id, body.leadId), eq(leads.workspaceId, user.workspaceId)))
        .limit(1);
    } else if (body.investorId) {
      const [latestLead] = await db
        .select({
          firstName: investors.firstName,
          firmName: firms.name,
          warmthScore: investors.warmthScore,
          pastInvestments: investors.pastInvestments,
          stage: leads.stage,
        })
        .from(leads)
        .innerJoin(investors, eq(investors.id, leads.investorId))
        .leftJoin(firms, eq(firms.id, investors.firmId))
        .where(and(eq(leads.investorId, body.investorId), eq(leads.workspaceId, user.workspaceId)))
        .orderBy(desc(leads.stageEnteredAt))
        .limit(1);
      row = latestLead;
    }
    if (row) {
      firstName = row.firstName;
      firmName = row.firmName ?? null;
      warmthScore = row.warmthScore ?? null;
      stage = row.stage;
      if (Array.isArray(row.pastInvestments)) portfolioCount = row.pastInvestments.length;
    }
  }

  const issues = heuristicChecks({ subject: body.subject, body: body.body }, firstName);

  // Stage-aware checks — leverage the resolved investor context.
  if (stage === 'closed_lost') {
    issues.push({
      kind: 'investor_already_passed',
      severity: 'error',
      message:
        'This investor is at closed_lost. Re-opening requires a different angle than another outbound.',
    });
  }
  if (portfolioCount > 0 && !/portfolio|invest(ed|ment)|backed/i.test(body.body)) {
    issues.push({
      kind: 'no_portfolio_reference',
      severity: 'info',
      message: `Their firm has ${portfolioCount} notable portfolio companies on file — referencing one tends to lift response rates.`,
    });
  }
  if (firmName && !body.body.toLowerCase().includes(firmName.toLowerCase())) {
    // Only flag if the email is medium-long and the firm name is present in
    // context — a one-line nudge doesn't need to drop the firm.
    if (body.body.length > 400) {
      issues.push({
        kind: 'no_personalization',
        severity: 'info',
        message: `Their firm "${firmName}" isn't mentioned anywhere. A single firm reference signals research.`,
      });
    }
  }

  // Lightweight AI critique — only when the heuristic pass doesn't already
  // have errors and the body is substantive enough to benefit. Capped at
  // 250 tokens out so latency stays low.
  const hasErrors = issues.some((i) => i.severity === 'error');
  const wantsAi = !hasErrors && body.body.trim().length >= 200;
  if (wantsAi) {
    try {
      await checkCap(user.workspaceId);
      const prompt = loadPrompt('drafter');
      const model = getModel('drafter');
      // Voice samples — gives the editor a reference for what "the
      // founder's tone" actually sounds like, so tone_shift flags fire
      // when the draft drifts away from past sent emails.
      const voiceSamples = await getFounderVoiceSamples(user.workspaceId, 2);
      const voiceBlock = formatVoiceBlock(voiceSamples);
      const sys = [
        'You are a critical editor for outbound founder→investor emails.',
        'Read the draft, identify up to 3 concrete issues. NO REWRITE.',
        'Each issue: {kind, severity, message}.',
        'kind ∈ tone_shift | kb_drift | no_portfolio_reference | filler | no_personalization | too_long.',
        'severity ∈ info | warn | error.',
        'message: <140 chars, actionable, present-tense.',
        'For tone_shift: compare the draft against the founder voice samples.',
        'Flag drifts in cadence, formality, or vocabulary that would feel off-brand.',
        'Output STRICT JSON: {"issues": [...]}.',
        'If the draft is genuinely good, return {"issues": []}.',
        '',
        voiceBlock || '## FOUNDER VOICE SAMPLES\n(no past sent emails on file)',
      ].join('\n');
      const investorLine = firstName
        ? `Recipient: ${firstName}${firmName ? ` at ${firmName}` : ''}${
            warmthScore ? ` (warmth ${warmthScore})` : ''
          }${portfolioCount > 0 ? `, ${portfolioCount} portfolio companies on file` : ''}.`
        : 'Recipient: bulk send (no specific investor context).';
      const userMsg = [
        investorLine,
        '',
        `SUBJECT: ${body.subject ?? '(empty)'}`,
        '',
        'BODY:',
        body.body,
        '',
        'Critique now. JSON only.',
      ].join('\n');
      const result = await runMessage({
        workspaceId: user.workspaceId,
        agent: 'drafter',
        model,
        promptHash: prompt.hash,
        promptVersion: prompt.version,
        system: sys,
        messages: [{ role: 'user', content: userMsg }] satisfies AiMessageParam[],
        maxTokens: 320,
        temperature: 0.2,
      });
      const cleaned = result.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = (() => {
        try {
          return JSON.parse(cleaned) as { issues?: Issue[] };
        } catch {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start >= 0 && end > start) {
            try {
              return JSON.parse(cleaned.slice(start, end + 1)) as { issues?: Issue[] };
            } catch {
              return null;
            }
          }
          return null;
        }
      })();
      if (parsed?.issues && Array.isArray(parsed.issues)) {
        for (const i of parsed.issues.slice(0, 3)) {
          if (
            typeof i === 'object' &&
            i &&
            typeof i.kind === 'string' &&
            typeof i.severity === 'string' &&
            typeof i.message === 'string'
          ) {
            issues.push(i);
          }
        }
      }
    } catch (err) {
      if (err instanceof CapExceededError) {
        // Don't fail — heuristics are still useful. Just skip the AI hop.
        issues.push({
          kind: 'kb_drift',
          severity: 'info',
          message: 'AI critique skipped (monthly cap reached).',
        });
      } else {
        // Swallow — critique is advisory, never blocking.
        console.warn('[draft.critique] ai hop failed', err);
      }
    }
  }

  return Response.json({ issues });
});
