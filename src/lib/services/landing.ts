import { cookies } from 'next/headers';

import { readNdaSession } from '@/lib/auth/nda-session';

export type LandingContext = {
  greeting: string;
  headline: string;
  subheadline: string;
  suggestedQuestions: string[];
  firmHint: string | null;
  hasNdaSession: boolean;
};

const FALLBACK_QUESTIONS = [
  'How is OotaOS different from existing restaurant POS platforms?',
  'What do your unit economics look like today?',
  'Why is now the right moment for restaurant tech in India?',
  'Who is on the team and what have they shipped before?',
];

const FIRM_SPECIFIC_QUESTIONS: Record<string, string[]> = {
  accel: [
    'How do you compare to Petpooja and Posist?',
    'What does your unit economics look like?',
    'Why now for restaurant tech in India?',
    'What is your seed-to-Series-A bridge look like?',
  ],
  sequoia: [
    'What is your top-of-funnel GTM motion?',
    'How do you think about category ownership?',
    'What is your path to $50M ARR?',
    'What would you spend a $10M cheque on in 18 months?',
  ],
  lightspeed: [
    'What is your product velocity vs. the incumbents?',
    'How defensible is the AI-native operator layer?',
    'Who owns the restaurant relationship — you or your channel partners?',
    'What does merchant retention look like after month 6?',
  ],
  matrix: [
    'What is your current burn and runway?',
    'How do you think about pricing and packaging?',
    'What is the structural CAC advantage you hold?',
    'What would make you raise Series A sooner than planned?',
  ],
};

function firmFromReferer(refererUrl: string | null): string | null {
  if (!refererUrl) return null;
  try {
    const host = new URL(refererUrl).hostname.toLowerCase();
    for (const key of Object.keys(FIRM_SPECIFIC_QUESTIONS)) {
      if (host.includes(key)) return key;
    }
  } catch {
    return null;
  }
  return null;
}

function firmFromQuery(firmParam: string | null): string | null {
  if (!firmParam) return null;
  const normalized = firmParam.toLowerCase().trim();
  for (const key of Object.keys(FIRM_SPECIFIC_QUESTIONS)) {
    if (normalized.includes(key)) return key;
  }
  return null;
}

export async function buildLandingContext(req: Request): Promise<LandingContext> {
  const url = new URL(req.url);
  const firmHint =
    firmFromQuery(url.searchParams.get('firm')) ?? firmFromReferer(req.headers.get('referer'));

  const cookieStore = await cookies();
  const ndaCookie = cookieStore.get('ootaos_nda')?.value;
  const ndaSession = readNdaSession(ndaCookie);

  const firmQuestions = firmHint ? FIRM_SPECIFIC_QUESTIONS[firmHint] : null;
  const greetingName = url.searchParams.get('name')?.slice(0, 40) ?? null;

  const greeting = greetingName
    ? `Hi ${greetingName} —`
    : firmHint
      ? `Hello from ${firmHint[0]!.toUpperCase()}${firmHint.slice(1)} —`
      : 'Welcome —';

  return {
    greeting,
    headline: 'OotaOS is the operating system modern restaurants run their entire day on.',
    subheadline: 'Ask me anything — the deck, the metrics, the roadmap.',
    suggestedQuestions: firmQuestions ?? FALLBACK_QUESTIONS,
    firmHint,
    hasNdaSession: ndaSession !== null,
  };
}
