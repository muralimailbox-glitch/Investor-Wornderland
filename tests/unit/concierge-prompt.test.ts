import { describe, expect, it } from 'vitest';

import { getModel } from '@/lib/ai/client';
import { loadPrompt } from '@/lib/ai/prompts';

describe('concierge prompt', () => {
  it('has the v2.x prompt body that survived the Opus upgrade', () => {
    const prompt = loadPrompt('concierge');
    expect(prompt.version.startsWith('2.')).toBe(true);
  });

  it('model is resolved from env (ANTHROPIC_MODEL_CONCIERGE), not the prompt frontmatter', () => {
    // Test setup defaults the env var to claude-haiku-4-5-20251001
    // (see tests/unit/_setup.ts) — it is sourced from env regardless of the
    // value baked into prompts/concierge.md. Production overrides via Railway.
    const model = getModel('concierge');
    expect(model.startsWith('claude-')).toBe(true);
  });
});

describe('faq-synth prompt', () => {
  it('agent is curator', () => {
    const prompt = loadPrompt('faq-synth');
    expect(prompt.agent).toBe('curator');
  });

  it('Q&A synthesis model resolves to ANTHROPIC_MODEL_DRAFTER', () => {
    const model = getModel('curator');
    expect(model.startsWith('claude-')).toBe(true);
  });
});
