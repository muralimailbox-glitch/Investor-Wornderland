import Anthropic from '@anthropic-ai/sdk';

import { aiLogsRepo, type AiLogInsert } from '@/lib/db/repos/ai-logs';
import { env, requireEnv } from '@/lib/env';

export type AiAgent = AiLogInsert['agent'];

let cached: Anthropic | null = null;

function sdk(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return cached;
}

/** Approximate USD cost in micro-dollars (USD * 1_000_000) for Claude calls. */
function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  // Published $/MTok rates as of Jan 2026. Update alongside model upgrades.
  // Haiku 4.5: $1 in / $5 out. Sonnet 4.6: $3 in / $15 out. Opus 4.7: $15 in / $75 out.
  const rates: Record<string, { in: number; out: number }> = {
    'claude-haiku-4-5-20251001': { in: 1, out: 5 },
    'claude-haiku-4-5': { in: 1, out: 5 },
    'claude-sonnet-4-6': { in: 3, out: 15 },
    'claude-opus-4-7': { in: 15, out: 75 },
  };
  const r = rates[model] ?? { in: 3, out: 15 };
  const usd = (inputTokens / 1_000_000) * r.in + (outputTokens / 1_000_000) * r.out;
  return Math.round(usd * 1_000_000);
}

type RunArgs = {
  workspaceId: string;
  agent: AiAgent;
  model: string;
  promptHash: string;
  promptVersion: string;
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  temperature?: number;
};

type RunResult = {
  text: string;
  stopReason: Anthropic.Message['stop_reason'];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
};

/**
 * Central Anthropic call. Every AI invocation in this codebase must go
 * through this function — scripts/audit-ai.sh enforces that. It writes an
 * ai_logs row for every completion (success, refusal, or error) so that
 * spend can be capped per workspace.
 */
export async function runMessage(args: RunArgs): Promise<RunResult> {
  const client = sdk();
  const startedAt = Date.now();
  const requestOptions: Anthropic.MessageCreateParamsNonStreaming = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: args.messages,
  };
  if (args.system !== undefined) requestOptions.system = args.system;
  if (args.temperature !== undefined) requestOptions.temperature = args.temperature;

  try {
    const response = await client.messages.create(requestOptions);
    const latencyMs = Date.now() - startedAt;
    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const usdCost = estimateCostMicroUsd(response.model, inputTokens, outputTokens);

    await aiLogsRepo.record({
      workspaceId: args.workspaceId,
      agent: args.agent,
      model: response.model,
      promptHash: args.promptHash,
      promptVersion: args.promptVersion,
      inputTokens,
      outputTokens,
      usdCost,
      latencyMs,
      outcome: 'ok',
    });

    return {
      text,
      stopReason: response.stop_reason,
      inputTokens,
      outputTokens,
      latencyMs,
      model: response.model,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await aiLogsRepo
      .record({
        workspaceId: args.workspaceId,
        agent: args.agent,
        model: args.model,
        promptHash: args.promptHash,
        promptVersion: args.promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        usdCost: 0,
        latencyMs,
        outcome: 'error',
      })
      .catch((logErr) => console.error('[ai] failed to persist error log:', logErr));
    throw err;
  }
}

export const MODELS = {
  concierge: env.ANTHROPIC_MODEL_CONCIERGE,
  drafter: env.ANTHROPIC_MODEL_DRAFTER,
  strategist: env.ANTHROPIC_MODEL_CONCIERGE,
  curator: env.ANTHROPIC_MODEL_CONCIERGE,
} as const;
