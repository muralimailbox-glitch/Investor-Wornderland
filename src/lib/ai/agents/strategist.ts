import type Anthropic from '@anthropic-ai/sdk';

import { CapExceededError, checkCap } from '@/lib/ai/cap';
import { runMessage } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';

export type StrategistSnapshot = {
  workspaceId: string;
  activeDeal: {
    stage: string;
    roundSizeUsd: number;
    closeTargetIso: string | null;
    daysToClose: number | null;
  } | null;
  pipelineByStage: Record<string, Array<{ firm: string; contact: string; lastTouchDays: number }>>;
  unreadInbox: Array<{ from: string; subject: string; ageHours: number }>;
  upcomingMeetings: Array<{ firm: string; startsAtIso: string }>;
  aiSpend: { last24hUsd: number; last30dUsd: number; capUsd: number; utilizationPct: number };
  anomalies: string[];
};

export type StrategistBrief = {
  headline: string;
  focus: Array<{ action: string; reason: string; priority: number }>;
  risks: Array<{ signal: string; suggestion: string }>;
  wins: string[];
  confidence: number;
  model: string;
  promptVersion: string;
};

function safeParse(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runStrategist(snapshot: StrategistSnapshot): Promise<StrategistBrief> {
  const prompt = loadPrompt('strategist');
  const cap = await checkCap(snapshot.workspaceId);
  if (cap.exceeded) throw new CapExceededError(cap);

  const { workspaceId: _, ...rest } = snapshot;
  void _;
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `## SNAPSHOT\n${JSON.stringify(rest, null, 2)}` },
  ];

  const result = await runMessage({
    workspaceId: snapshot.workspaceId,
    agent: 'strategist',
    model: prompt.model,
    promptHash: prompt.hash,
    promptVersion: prompt.version,
    system: prompt.body,
    messages,
    maxTokens: prompt.maxTokens,
    temperature: prompt.temperature,
  });

  const parsed = safeParse(result.text);
  const headline =
    typeof parsed?.headline === 'string'
      ? parsed.headline
      : 'Not enough signal to brief today — check the pipeline tab.';
  const focus = Array.isArray(parsed?.focus)
    ? (parsed.focus as Array<Record<string, unknown>>).slice(0, 4).map((f) => ({
        action: String(f.action ?? ''),
        reason: String(f.reason ?? ''),
        priority: Number(f.priority ?? 99),
      }))
    : [];
  const risks = Array.isArray(parsed?.risks)
    ? (parsed.risks as Array<Record<string, unknown>>).slice(0, 3).map((r) => ({
        signal: String(r.signal ?? ''),
        suggestion: String(r.suggestion ?? ''),
      }))
    : [];
  const wins = Array.isArray(parsed?.wins)
    ? (parsed.wins as unknown[]).filter((w): w is string => typeof w === 'string').slice(0, 3)
    : [];
  const confidence = Math.max(
    0,
    Math.min(1, typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5),
  );

  return {
    headline,
    focus,
    risks,
    wins,
    confidence,
    model: result.model,
    promptVersion: prompt.version,
  };
}
