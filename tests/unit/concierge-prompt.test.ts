import { describe, expect, it } from 'vitest';

import { loadPrompt } from '@/lib/ai/prompts';

describe('concierge prompt', () => {
  it('uses claude-opus-4-7 for quality-first investor responses', () => {
    const prompt = loadPrompt('concierge');
    expect(prompt.model).toBe('claude-opus-4-7');
  });

  it('has the v2.x prompt body that survived the Opus upgrade', () => {
    const prompt = loadPrompt('concierge');
    expect(prompt.version.startsWith('2.')).toBe(true);
  });
});

describe('faq-synth prompt', () => {
  it('exists and uses Opus 4.7', () => {
    const prompt = loadPrompt('faq-synth');
    expect(prompt.agent).toBe('curator');
    expect(prompt.model).toBe('claude-opus-4-7');
  });
});
