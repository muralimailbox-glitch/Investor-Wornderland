import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { runMessage, type AiMessageParam } from '@/lib/ai/client';
import { classifyDepth, type DepthTopic } from '@/lib/ai/depth';
import { REFUSAL_TEXT, scrubInjection } from '@/lib/ai/injection';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatContextBlock, retrieve, type RetrievedChunk } from '@/lib/ai/retrieve';

export type InvestorContext = {
  investorId: string;
  firstName: string;
  lastName: string | null;
  firmName: string | null;
  emailVerified: boolean;
};

export type ConciergeInput = {
  workspaceId: string;
  sessionId: string;
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signedNda?: boolean;
  investor?: InvestorContext | null;
};

export type ConciergeGate = {
  needsEmailVerify: boolean;
  needsNda: boolean;
  topics: DepthTopic[];
};

export type ConciergeResult = {
  answer: string;
  citations: Array<{ section: string; version: string; similarity: number }>;
  refused: boolean;
  refusalReason?: 'injection' | 'no_context' | 'cap_exceeded';
  model: string;
  promptVersion: string;
  gate: ConciergeGate;
  depthTopics: DepthTopic[];
};

const NO_CONTEXT_MESSAGE =
  "I don't have that specific detail in what the founders have shared publicly. The fastest way to get a precise answer is to book a 20-minute call with the founding team — I can pull three open slots if you'd like.";

function buildSessionBlock(input: ConciergeInput): string {
  const lines: string[] = [];
  const trust = input.signedNda
    ? 'nda_signed'
    : input.investor?.emailVerified
      ? 'email_verified'
      : 'casual';
  lines.push(`Trust level: ${trust}.`);
  if (input.investor) {
    lines.push(`Investor first name: ${input.investor.firstName}.`);
    if (input.investor.firmName) lines.push(`Investor firm: ${input.investor.firmName}.`);
  } else {
    lines.push('Investor: anonymous visitor (no magic link redeemed).');
  }
  return lines.join(' ');
}

export async function runConcierge(input: ConciergeInput): Promise<ConciergeResult> {
  const prompt = loadPrompt('concierge');

  const cap = await checkCap(input.workspaceId);
  if (cap.exceeded) {
    throw new CapExceededError(cap);
  }

  const depthSignal = classifyDepth(input.question);
  const gate: ConciergeGate = {
    needsEmailVerify:
      depthSignal.depth === 'deep' && !input.signedNda && !input.investor?.emailVerified,
    needsNda: depthSignal.depth === 'deep' && !input.signedNda,
    topics: depthSignal.topics,
  };

  const scrub = scrubInjection(input.question);
  if (scrub.hadInjection) {
    return {
      answer: REFUSAL_TEXT,
      citations: [],
      refused: true,
      refusalReason: 'injection',
      model: prompt.model,
      promptVersion: prompt.version,
      gate: { needsEmailVerify: false, needsNda: false, topics: [] },
      depthTopics: [],
    };
  }

  const chunks: RetrievedChunk[] = await retrieve(input.workspaceId, input.question, { topK: 5 });

  if (chunks.length === 0) {
    return {
      answer: NO_CONTEXT_MESSAGE,
      citations: [],
      refused: true,
      refusalReason: 'no_context',
      model: prompt.model,
      promptVersion: prompt.version,
      gate,
      depthTopics: depthSignal.topics,
    };
  }

  const contextBlock = formatContextBlock(chunks);
  const sessionBlock = buildSessionBlock(input);
  const systemPrompt = `${prompt.body}\n\n## CONTEXT\n${contextBlock}\n\n## SESSION\n${sessionBlock}`;

  const messages: AiMessageParam[] = [];
  for (const turn of input.history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: scrub.safe });

  const result = await runMessage({
    workspaceId: input.workspaceId,
    agent: 'concierge',
    model: prompt.model,
    promptHash: prompt.hash,
    promptVersion: prompt.version,
    system: systemPrompt,
    messages,
    maxTokens: prompt.maxTokens,
    temperature: prompt.temperature,
  });

  const citations = chunks.map((c) => ({
    section: c.section,
    version: c.version,
    similarity: Math.round(c.similarity * 1000) / 1000,
  }));

  return {
    answer: result.text.trim(),
    citations,
    refused: false,
    model: result.model,
    promptVersion: prompt.version,
    gate,
    depthTopics: depthSignal.topics,
  };
}
