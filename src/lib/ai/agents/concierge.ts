import type Anthropic from '@anthropic-ai/sdk';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { runMessage } from '@/lib/ai/client';
import { REFUSAL_TEXT, scrubInjection } from '@/lib/ai/injection';
import { loadPrompt } from '@/lib/ai/prompts';
import { formatContextBlock, retrieve, type RetrievedChunk } from '@/lib/ai/retrieve';

export type ConciergeInput = {
  workspaceId: string;
  sessionId: string;
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signedNda?: boolean;
};

export type ConciergeResult = {
  answer: string;
  citations: Array<{ section: string; version: string; similarity: number }>;
  refused: boolean;
  refusalReason?: 'injection' | 'no_context' | 'cap_exceeded';
  model: string;
  promptVersion: string;
};

const NO_CONTEXT_MESSAGE =
  "I don't have that specific detail in what the founders have shared publicly. The fastest way to get a precise answer is to book a 20-minute call with the founding team — I can pull three open slots if you'd like.";

export async function runConcierge(input: ConciergeInput): Promise<ConciergeResult> {
  const prompt = loadPrompt('concierge');

  const cap = await checkCap(input.workspaceId);
  if (cap.exceeded) {
    throw new CapExceededError(cap);
  }

  const scrub = scrubInjection(input.question);
  if (scrub.hadInjection) {
    return {
      answer: REFUSAL_TEXT,
      citations: [],
      refused: true,
      refusalReason: 'injection',
      model: prompt.model,
      promptVersion: prompt.version,
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
    };
  }

  const contextBlock = formatContextBlock(chunks);
  const ndaNote = input.signedNda ? 'NDA: signed (deeper numbers permitted).' : 'NDA: not signed.';
  const systemPrompt = `${prompt.body}\n\n## CONTEXT\n${contextBlock}\n\n## SESSION\n${ndaNote}`;

  const messages: Anthropic.MessageParam[] = [];
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
  };
}
