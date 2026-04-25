import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPTS_DIR = join(process.cwd(), 'prompts');

type Frontmatter = {
  agent: string;
  model: string;
  temperature: number;
  version: string;
  max_tokens: number;
};

export type LoadedPrompt = {
  agent: string;
  model: string;
  temperature: number;
  version: string;
  maxTokens: number;
  body: string;
  hash: string;
};

const cache = new Map<string, LoadedPrompt>();

function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  if (!raw.startsWith('---')) {
    throw new Error('prompt file missing YAML frontmatter');
  }
  const end = raw.indexOf('\n---', 3);
  if (end === -1) throw new Error('prompt frontmatter is not terminated');
  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();

  const fm: Partial<Frontmatter> = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === 'agent') fm.agent = value;
    else if (key === 'model') fm.model = value;
    else if (key === 'temperature') fm.temperature = Number(value);
    else if (key === 'version') fm.version = value;
    else if (key === 'max_tokens') fm.max_tokens = Number(value);
  }

  if (!fm.agent || !fm.model || !fm.version) {
    throw new Error('prompt frontmatter missing agent/model/version');
  }
  return {
    fm: {
      agent: fm.agent,
      model: fm.model,
      temperature: fm.temperature ?? 0.3,
      version: fm.version,
      max_tokens: fm.max_tokens ?? 800,
    },
    body,
  };
}

export function loadPrompt(
  name: 'concierge' | 'drafter' | 'strategist' | 'tracxn-parse' | 'faq-synth',
): LoadedPrompt {
  const cached = cache.get(name);
  if (cached) return cached;
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const loaded: LoadedPrompt = {
    agent: fm.agent,
    model: fm.model,
    temperature: fm.temperature,
    version: fm.version,
    maxTokens: fm.max_tokens,
    body,
    hash,
  };
  cache.set(name, loaded);
  return loaded;
}
