import type Anthropic from '@anthropic-ai/sdk';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { runMessage } from '@/lib/ai/client';
import { scrubInjection } from '@/lib/ai/injection';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatContextBlock, retrieve } from '@/lib/ai/retrieve';

export type DrafterInput = {
  workspaceId: string;
  incomingFrom: string;
  incomingSubject: string;
  incomingBody: string;
  investorContext?: {
    firmName?: string;
    stage?: string;
    lastMeetingIso?: string | null;
    docsViewed?: number;
  };
  signatureBlock: string;
};

export type DrafterOutput = {
  subject: string;
  body: string;
  tone: 'warm' | 'formal' | 'urgent';
  intent: 'answer' | 'schedule' | 'nudge' | 'decline' | 'escalate';
  citedSections: string[];
  suggestedNextStep: 'book_meeting' | 'share_doc' | 'wait' | 'escalate_to_founder';
  confidence: number;
  rawModelOutput: string;
  model: string;
  promptVersion: string;
};

function safeJsonParse(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runDrafter(input: DrafterInput): Promise<DrafterOutput> {
  const prompt = loadPrompt('drafter');
  const cap = await checkCap(input.workspaceId);
  if (cap.exceeded) throw new CapExceededError(cap);

  const scrubSubject = scrubInjection(input.incomingSubject);
  const scrubBody = scrubInjection(input.incomingBody);

  const query = `${input.incomingSubject}\n\n${input.incomingBody}`.slice(0, 1500);
  const chunks = await retrieve(input.workspaceId, query, { topK: 6 });
  const contextBlock = formatContextBlock(chunks);

  const investorCtx = input.investorContext ?? {};
  const investorLine = [
    investorCtx.firmName && `firm=${investorCtx.firmName}`,
    investorCtx.stage && `stage=${investorCtx.stage}`,
    investorCtx.lastMeetingIso ? `last_meeting=${investorCtx.lastMeetingIso}` : 'last_meeting=none',
    investorCtx.docsViewed !== undefined && `docs_viewed=${investorCtx.docsViewed}`,
  ]
    .filter(Boolean)
    .join(', ');

  const userPayload = [
    `## INCOMING EMAIL`,
    `From: ${input.incomingFrom}`,
    `Subject: ${scrubSubject.safe}`,
    `Body:\n${scrubBody.safe}`,
    '',
    `## INVESTOR CONTEXT`,
    investorLine || 'none',
    '',
    `## KNOWLEDGE CHUNKS`,
    contextBlock,
    '',
    `## SIGNATURE BLOCK (use verbatim)`,
    input.signatureBlock,
  ].join('\n');

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPayload }];

  const result = await runMessage({
    workspaceId: input.workspaceId,
    agent: 'drafter',
    model: prompt.model,
    promptHash: prompt.hash,
    promptVersion: prompt.version,
    system: prompt.body,
    messages,
    maxTokens: prompt.maxTokens,
    temperature: prompt.temperature,
  });

  const parsed = safeJsonParse(result.text);
  const subject =
    typeof parsed?.subject === 'string' ? parsed.subject : `Re: ${input.incomingSubject}`;
  const body = typeof parsed?.body === 'string' ? parsed.body : result.text.trim();
  const tone = (parsed?.tone as DrafterOutput['tone']) ?? 'warm';
  const intent = (parsed?.intent as DrafterOutput['intent']) ?? 'answer';
  const citedSections = Array.isArray(parsed?.citedSections)
    ? (parsed.citedSections as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const suggestedNextStep =
    (parsed?.suggestedNextStep as DrafterOutput['suggestedNextStep']) ?? 'escalate_to_founder';
  const confidenceRaw = typeof parsed?.confidence === 'number' ? parsed.confidence : 0.4;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

  return {
    subject,
    body,
    tone,
    intent,
    citedSections,
    suggestedNextStep,
    confidence,
    rawModelOutput: result.text,
    model: result.model,
    promptVersion: prompt.version,
  };
}
