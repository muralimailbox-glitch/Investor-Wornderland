/**
 * Seed the default workspace's knowledge_chunks table with grounded
 * content so the concierge has something to retrieve. Must be run AFTER
 * `pnpm db:seed` (which creates the default workspace).
 *
 * Dotenv is loaded manually and BEFORE any app module import so the
 * @/lib/env contract is satisfied in the tsx runtime.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const KNOWLEDGE: Array<{ section: string; version: string; text: string }> = [
  {
    section: 'pitch',
    version: 'v3',
    text: `OotaOS is an AI-native investor relations platform for early-stage founders.

We replace the messy thread of pitch decks, NDA PDFs, and email follow-ups with a single always-on concierge that answers investor questions, gates the data room behind a signed NDA, and books founder meetings automatically.

The platform is built on Next.js 15, Postgres with pgvector, and Anthropic Claude. Every answer is grounded in the founder's own writing — no hallucinations, no open-web browsing, full citations.

We are based in Bengaluru. Our customers are seed and Series A founders raising between $2M and $20M.`,
  },
  {
    section: 'traction',
    version: 'v2',
    text: `Since private beta in Q4 2025 we have onboarded 18 founder workspaces.

Aggregate numbers across the beta: 340 investor conversations handled by the AI concierge, 112 NDAs signed through the self-serve flow, 64 founder meetings booked. Median time from first investor question to NDA signature is 4 minutes.

Concierge grounded-answer rate sits at 94% — the remaining 6% route to graceful refusal with an offer to book a call. Zero hallucinations flagged by founders in the last 90 days.

Monthly active founders: 14 of 18. NPS from founders is +62. Investors who complete the NDA flow report a median of 4.6 out of 5 on the "did this feel high-quality" post-signup survey.`,
  },
  {
    section: 'round',
    version: 'v1',
    text: `We are raising a $4M seed round to close by end of Q2 2026.

Target terms: $4M at $20M post-money SAFE, with a 20% option pool created pre-close. We have $1.6M in soft circles from two tier-one India funds and four founder-operator angels. Lead-investor check size $1.5M to $2M.

Use of funds: 60% engineering (two senior full-stack, one ML engineer focused on retrieval eval), 25% go-to-market and founder-led sales in India and SE Asia, 15% runway buffer for 18 months of operation at the planned burn.

The round is not a priced round. We expect to do the priced Series A in 2027 once we are at $1M ARR.`,
  },
  {
    section: 'team',
    version: 'v1',
    text: `The founding team is two people.

Murali Krishnan (CEO) spent 11 years at enterprise SaaS companies including as a founding engineer at a venture-backed ERP platform. He writes all customer-facing content and owns the AI guardrails.

Priya Nair (CTO) is an applied-ML engineer who spent 6 years at a payments company building fraud detection and document understanding pipelines. She owns the retrieval, evaluation, and deployment stack.

We have worked together informally for three years and formally as co-founders since Q3 2025. First hire planned within 60 days of close: a senior full-stack engineer to own the founder cockpit UI.`,
  },
  {
    section: 'moat',
    version: 'v1',
    text: `Our moat is the pairing of prompt discipline with auditable retrieval.

Three things compound: (1) a growing library of versioned prompts tuned per agent (concierge, drafter, strategist) that competitors cannot copy without matching our eval suite; (2) a founder-facing evaluation loop that flags hallucinations within 24 hours and retrains retrieval thresholds per workspace; (3) a tight integration with Zoho and Google mail so the inbox becomes a first-class source of truth alongside the pitch deck.

Competitors who ship "AI investor CRM" features treat AI as a chat bubble. Our design treats AI as a grounded spokesperson with hard rules: never send mail, never move a stage, never answer from outside the knowledge base.`,
  },
  {
    section: 'market',
    version: 'v1',
    text: `Our primary market is India and SE Asia: roughly 8,000 seed-stage fundraises per year across these geographies, with an estimated $4B in annual round value.

We expand to Europe and North America once the India playbook is proven, driven by the observation that founders in those geographies currently rely on spreadsheet-based CRMs (Airtable, Notion) plus calendar tools plus DocSend — a fragmented stack with no AI layer.

Serviceable obtainable market in year three at a $200/month average price: $10M ARR from 4,000 paying founder workspaces globally.`,
  },
];

async function main() {
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { usersRepo } = await import('@/lib/db/repos/users');
  const { ingestKnowledge, wipeKnowledge } = await import('@/lib/services/knowledge');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  console.log(`seeding knowledge for workspace ${workspace.id}`);
  await wipeKnowledge(workspace.id, actorUserId);

  let total = 0;
  for (const entry of KNOWLEDGE) {
    const result = await ingestKnowledge({
      workspaceId: workspace.id,
      actorUserId,
      section: entry.section,
      version: entry.version,
      text: entry.text,
    });
    console.log(`  ingested ${entry.section}.${entry.version} → ${result.inserted} chunks`);
    total += result.inserted;
  }
  console.log(`done — ${total} chunks embedded into ${workspace.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
