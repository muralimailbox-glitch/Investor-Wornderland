/**
 * Prompt-injection scrubbing. Called before any user-provided string is
 * concatenated into a prompt. Returns the neutralized text plus a boolean
 * flag so the caller can decide whether to short-circuit with a refusal.
 *
 * Policy: we do NOT silently drop input — we wrap it in quote markers and
 * add a marker note so the model treats it as a quoted investor message
 * rather than a directive. Matches are logged so the founder can review.
 */
const INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: 'ignore-prior',
    re: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  },
  {
    name: 'reveal-system',
    re: /\b(reveal|show|print|output|dump|tell me)\s+(the\s+)?(system|hidden|secret)\s+prompt/i,
  },
  { name: 'role-override', re: /\byou are now\s+(a|an)?\s*\w+/i },
  { name: 'act-as', re: /\bact as\s+(a|an)?\s*(system|admin|root|developer)/i },
  { name: 'send-email', re: /\b(send|email|mail|forward)\s+(an?\s+)?email\s+to\b/i },
  { name: 'exec-code', re: /\b(execute|eval|run)\s+(this\s+)?(code|script|command|shell)/i },
  {
    name: 'leak-config',
    re: /\b(print|show|dump|reveal)\s+(your|the)\s+(api[\s_-]?key|secret|token|env|config)/i,
  },
  {
    name: 'bypass-policy',
    re: /\b(bypass|override|disable)\s+(the\s+)?(safety|content|policy|filter|guard)/i,
  },
  { name: 'jailbreak', re: /\b(DAN|jailbreak|developer mode|unfiltered mode|god mode)\b/i },
  { name: 'token-injection', re: /<\|(im_start|system|assistant|user|endoftext)\|>/i },
];

export type ScrubResult = {
  safe: string;
  matched: string[];
  hadInjection: boolean;
};

export function scrubInjection(input: string): ScrubResult {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.re.test(input)) matched.push(pattern.name);
  }
  const safe = input.replace(/<\|[a-z_]+\|>/gi, '[filtered-token]').slice(0, 4000);
  return {
    safe: `[user message start]\n${safe}\n[user message end]`,
    matched,
    hadInjection: matched.length > 0,
  };
}

export const REFUSAL_TEXT =
  "I'm here to help you understand OotaOS and meet the founders. I can't do that, but I can book you a call with Priya and the team — want three times that work this week?";
