export type QuestionDepth = 'shallow' | 'deep';

export type DepthTopic =
  | 'financials'
  | 'cap_table'
  | 'terms'
  | 'customers'
  | 'ip'
  | 'team_comp'
  | 'roadmap_detail';

export type DepthSignal = {
  depth: QuestionDepth;
  topics: DepthTopic[];
};

const PATTERNS: Array<{ topic: DepthTopic; regex: RegExp }> = [
  {
    topic: 'financials',
    regex:
      /\b(mrr|arr|revenue|burn\s*rate|runway|gross\s*margin|cac|ltv|unit\s*economics|p&l|cash\s*flow|ebitda|gmv|take\s*rate|churn|retention\s*curve|cohort|payback)\b/i,
  },
  {
    topic: 'cap_table',
    regex:
      /\b(cap\s*table|ownership|dilution|safe(\s*note)?|convertible|valuation|pre-?money|post-?money|option\s*pool|esop|share\s*class|vesting|cliff)\b/i,
  },
  {
    topic: 'terms',
    regex:
      /\b(liquidation\s*pref|liq\s*pref|anti-?dilution|board\s*seat|pro-?rata|information\s*rights|drag\s*along|tag\s*along|rofr|veto)\b/i,
  },
  {
    topic: 'customers',
    regex:
      /\b(customer\s*list|named\s*customer|specific\s*customer|who\s*(are|is)\s*your\s*customers?|customer\s*contract|signed\s*contract|paying\s*customers?\s*names?|pilot\s*customer)\b/i,
  },
  {
    topic: 'ip',
    regex:
      /\b(patent|trade\s*secret|proprietary\s*algorithm|source\s*code|ip\s*portfolio|technical\s*moat\s*detail|architecture\s*diagram)\b/i,
  },
  {
    topic: 'team_comp',
    regex:
      /\b(founder\s*salar(y|ies)|team\s*compensation|equity\s*grant|equity\s*split|employee\s*stock)\b/i,
  },
  {
    topic: 'roadmap_detail',
    regex:
      /\b(detailed\s*roadmap|specific\s*roadmap|internal\s*roadmap|sprint\s*plan|engineering\s*plan\s*detail)\b/i,
  },
];

export function classifyDepth(question: string): DepthSignal {
  const topics: DepthTopic[] = [];
  for (const p of PATTERNS) {
    if (p.regex.test(question)) topics.push(p.topic);
  }
  return {
    depth: topics.length > 0 ? 'deep' : 'shallow',
    topics,
  };
}
