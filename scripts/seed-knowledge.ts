/**
 * Seed the default workspace's knowledge_chunks table with grounded
 * content so the concierge has something to retrieve. Must be run AFTER
 * `pnpm db:seed` (which creates the default workspace).
 *
 * Dotenv is loaded manually and BEFORE any app module import so the
 * @/lib/env contract is satisfied in the tsx runtime.
 *
 * Each entry below is a self-contained narrative passage. The ingestion
 * service splits long passages into ~600-char chunks before embedding.
 * Cover the questions investors actually ask: what, who, market, why now,
 * traction, round, terms, moat, pricing, security, hiring, risks, FAQ.
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
    section: 'one_liner',
    version: 'v1',
    text: `One sentence: OotaOS turns a fundraise into a conversation — investors ask anything, our AI answers from the founder's own writing with citations, and the data room opens the moment they sign the NDA.

The category we belong to is "AI-native investor relations" — not a CRM, not a data room, not a chatbot. A spokesperson that never forgets a number and never goes off-message.`,
  },
  {
    section: 'problem',
    version: 'v1',
    text: `Founders raise twice. Once for the money, and continuously for attention. Investors are inundated, decks get skimmed for 90 seconds, follow-up email threads die in week three.

The fundraise stack today is fragmented: Notion or Airtable for the CRM, DocSend for the deck, a manual NDA-by-email loop, Calendly for meetings, a personal inbox for every conversation. Founders spend 60-70% of their fundraising hours on logistics — chasing replies, resending decks, redacting NDAs, scheduling — instead of selling.

OotaOS collapses that stack into one surface. Investors arrive at a personalized link, ask anything in plain English, get grounded answers with citations, sign a 60-second NDA, and walk straight into the data room.`,
  },
  {
    section: 'why_now',
    version: 'v1',
    text: `Three forces converged in the last 18 months that make this category possible only now.

First, retrieval-grounded LLMs crossed the quality threshold where a model can speak on behalf of a founder without hallucinating, provided the corpus is well-organized and citations are mandatory. We do not allow open-web browsing or training-data recall — every answer cites a section the founder wrote.

Second, founder writing has become the highest-leverage asset of a fundraise. Pitch decks have shrunk; long-form posts, memos, FAQs, and design docs have grown. Our platform turns that corpus into a 24/7 spokesperson.

Third, investor calendars are fuller than ever. The first ten minutes of an investor's interest in a startup are now a Slack DM and a "send me your deck" — not a 30-minute call. We meet investors in those ten minutes.`,
  },
  {
    section: 'product',
    version: 'v2',
    text: `Three things ship today.

(1) The Public Wonderland — a magic-link-personalized investor landing page with a concierge chat ("Ask Priya"), a 60-second self-serve NDA flow, a data room that watermarks every PDF per investor, and a founder lounge with a meeting booker.

(2) The Founder Cockpit — a CRM-grade dashboard for the founding team. Pipeline view across stages, investor and firm pages with thesis-fit scoring, an AI-drafted reply panel for the inbox, AI cost monitoring per workspace, and a knowledge editor where the founder writes the source-of-truth content the concierge cites.

(3) The AI Layer — three named agents (Concierge for investor chat, Drafter for email replies, Strategist for cockpit summaries) that share a centralized client, mandatory citations, hard cost cap, prompt-injection scrubbing, and per-workspace evaluation logs.

There is no "send" button on the AI side. Every email, every record change, every stage move is a button a human founder presses. AI drafts. Founders ship.`,
  },
  {
    section: 'concierge',
    version: 'v1',
    text: `The concierge is an AI persona named Priya who answers investor questions on behalf of the founders. She speaks warmly, with full citations, and only from content the founders themselves wrote.

She handles the casual surface — what OotaOS does, the team, the market, the why-now narrative — freely. The moment a question goes deep (specific MRR, cap-table detail, churn cohorts, named customer contracts, IP detail), she gracefully invites the investor to verify their email and sign the NDA. She never gatekeeps the basic narrative; she gates the numbers.

She refuses jailbreaks and prompt-injection attempts with a single line and an offer to book the founders directly. She never sends mail, never moves a stage, never edits a record.

If a question has no good match in the knowledge base (similarity below 0.65), she returns a graceful "I don't have that publicly — let me book you with the founders" rather than guessing.`,
  },
  {
    section: 'data_room',
    version: 'v1',
    text: `The data room opens the moment an investor signs the mutual NDA — no manual unlock, no founder pings.

Every PDF served from the data room is watermarked per investor with their email and the timestamp of access. The watermark policy is configurable per document: per_investor, static, or none. Term sheets and the cap table default to per_investor. The pitch deck defaults to none for friction reasons.

Share links are signed, expiring (default 15 minutes), and revocable. Every download is logged to the audit trail with IP, user agent, and timestamp.

The cockpit shows the founder which documents each investor opened and how long they spent — a rough engagement signal that travels with the lead's stage.`,
  },
  {
    section: 'nda',
    version: 'v1',
    text: `The NDA flow is mutual, founder-friendly, and self-serve. It takes about 60 seconds.

The investor enters their name, title, firm, and work email. We send a 6-digit OTP that expires in 10 minutes. After verification, they review the short-form clauses on screen and click sign. We immediately seal the PDF — adding their full name, firm, IP, user-agent, signed-at timestamp, and the template version — and email a countersigned copy with a 15-minute signed download URL.

The terms are mutual: both parties keep the other's non-public information confidential for two years. We chose mutual rather than one-way because we are pitching investors and they are pitching us — the relationship is bidirectional.

Every signed NDA is stored with its sha256 in our audit log. We never lose track of who signed what.`,
  },
  {
    section: 'cockpit',
    version: 'v1',
    text: `The founder cockpit is where the team runs the round. A single shell with five sections: deal, pipeline, investors, inbox, knowledge.

The deal page shows the round at a glance — target size, pre-money, post-money, committed dollars, percent closed, optional pool. Editable inline.

The pipeline page is a kanban across ten stages — prospect, contacted, engaged, nda_pending, nda_signed, meeting_scheduled, diligence, term_sheet, funded, closed_lost. Drag-drop transitions are audit-logged.

The investors page is a searchable, filterable grid with bulk import (JSON or CSV), Tracxn auto-enrichment, and per-investor activity drawers showing every interaction (page views, questions, NDA signatures, document opens).

The inbox is a unified IMAP feed. The Drafter agent suggests a reply for each email; the founder edits and presses send. We never auto-send.

The knowledge page is where the founder writes — markdown content, organized by section. The concierge cites the section and version on every answer.`,
  },
  {
    section: 'team',
    version: 'v1',
    text: `The founding team is two people.

Murali Krishnan (CEO) spent 11 years at enterprise SaaS companies including as a founding engineer at a venture-backed ERP platform. He writes all customer-facing content and owns the AI guardrails. Bengaluru-based.

Priya Nair (CTO) is an applied-ML engineer who spent 6 years at a payments company building fraud detection and document understanding pipelines. She owns the retrieval, evaluation, and deployment stack. Bengaluru-based.

We have worked together informally for three years and formally as co-founders since Q3 2025. First hire planned within 60 days of close: a senior full-stack engineer to own the founder cockpit UI. Second and third hires within 180 days: a senior ML engineer to own retrieval evaluation and a founder-led GTM lead for India.`,
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
    section: 'use_of_funds',
    version: 'v1',
    text: `The $4M unlocks 18 months of runway at the planned burn.

Engineering ($2.4M, 60%): two senior full-stack engineers ($60K each per year fully loaded India), one senior ML engineer ($90K), one product-design contractor for cockpit polish, plus annual SaaS tooling.

Go-to-market ($1.0M, 25%): one founder-led BD lead, two founding-customer-success engineers, one content/community lead, plus targeted founder-events sponsorship in India and SE Asia.

Runway buffer ($0.6M, 15%): legal, finance, audit, infrastructure cost ceiling, and a deliberately conservative 18-month visibility on burn.

We grow into a priced Series A at $1M ARR. The seed buys us the team to get there.`,
  },
  {
    section: 'moat',
    version: 'v1',
    text: `Our moat is the pairing of prompt discipline with auditable retrieval.

Three things compound: (1) a growing library of versioned prompts tuned per agent (concierge, drafter, strategist) that competitors cannot copy without matching our eval suite; (2) a founder-facing evaluation loop that flags hallucinations within 24 hours and retrains retrieval thresholds per workspace; (3) a tight integration with Zoho and Google mail so the inbox becomes a first-class source of truth alongside the pitch deck.

Competitors who ship "AI investor CRM" features treat AI as a chat bubble. Our design treats AI as a grounded spokesperson with hard rules: never send mail, never move a stage, never answer from outside the knowledge base.`,
  },
  {
    section: 'competition',
    version: 'v1',
    text: `Three categories overlap with us, none of them ship the same thing.

DocSend / Brij and other deck-tracking tools — they tell you the deck got opened. They don't speak for the founder, don't gate documents behind a signed NDA, don't book meetings. We replace them.

Foundersuite, Visible, Affinity — these are CRM tools for fundraising. They organize who you talk to. They don't talk for you. We sit on top of a CRM (or replace it for early-stage founders who don't have one).

ChatGPT-style chat widgets — these are open-web bots glued onto a marketing page. They hallucinate, they have no audit trail, they have no NDA flow. Investors notice the difference within two questions.

Our wedge is the combination: grounded chat + NDA + watermarked data room + cockpit, all in one surface, all founder-controlled.`,
  },
  {
    section: 'market',
    version: 'v1',
    text: `Our primary market is India and SE Asia: roughly 8,000 seed-stage fundraises per year across these geographies, with an estimated $4B in annual round value.

We expand to Europe and North America once the India playbook is proven, driven by the observation that founders in those geographies currently rely on spreadsheet-based CRMs (Airtable, Notion) plus calendar tools plus DocSend — a fragmented stack with no AI layer.

Serviceable obtainable market in year three at a $200/month average price: $10M ARR from 4,000 paying founder workspaces globally.`,
  },
  {
    section: 'pricing',
    version: 'v1',
    text: `Pricing is per founder workspace per month, billed annually.

Solo plan, $99/month: one workspace, one founder seat, unlimited investors, the full concierge + NDA + data room stack, 100K AI tokens per month included.

Team plan, $249/month: up to five team seats, advanced cockpit (pipeline, inbox, drafter), 500K AI tokens, priority support, custom NDA template upload.

Series plan, $749/month: white-label option, custom domain, dedicated retrieval eval, 2M AI tokens, SSO, dedicated success engineer.

Most beta founders are on Team. The price point assumes a founder considers $250/month a rounding error in the cost of fundraising — and so far that has held.`,
  },
  {
    section: 'business_model',
    version: 'v1',
    text: `We charge SaaS — annual subscriptions, monthly billing option for solo plan only.

Gross margin target at scale is 78%. The largest variable cost line is Anthropic API spend, which we cap per workspace ($50/month default, configurable up to $200). Embeddings run locally on a small CPU model — zero per-call cost.

We do not take a percentage of the round, do not charge per investor, do not charge per document. The price is independent of round size — a $2M seed founder pays the same as a $20M Series A founder, which keeps the value/price ratio extreme for larger rounds.

Average revenue per workspace target by month 24: $230. Net revenue retention target: 110% (driven by team plan upgrades as the round grows).`,
  },
  {
    section: 'unit_economics',
    version: 'v1',
    text: `On the team plan ($249/mo), CAC payback target is six months, blended across organic and paid channels.

Founder-led GTM is our cheapest channel — the typical funnel today is "founder posts on LinkedIn, three founders DM, one converts" which costs effectively zero.

Paid CAC sits at roughly $400 (LinkedIn ads to founder communities), giving a 1.6x payback on month one, 6 months to recoup, ~3.5x LTV/CAC at the planned 18-month average lifetime. As we shift up to Team and Series plans, payback compresses.

Annual cost per workspace: $40 in infra (Railway, Cloudflare R2, Postgres) + ~$20 in average AI usage = $60/year direct cost. At $2,988 ARR per workspace on Team plan, that's a 98% gross margin before salaries.`,
  },
  {
    section: 'security',
    version: 'v1',
    text: `Security is built in, not bolted on.

Every API handler validates input with Zod, requires authentication where appropriate, applies rate limits, and writes an audit event on state-changing actions. The audit feed is queryable from the cockpit.

Secrets live in Railway env vars; no secret is committed to the repo. Pre-commit hooks scan for accidentally added secrets and block the commit.

Sessions are HttpOnly, Secure (in production), SameSite=Lax cookies. Lucia v3 manages the session lifecycle. Founder accounts require a TOTP MFA code on every login.

PDFs in the data room are watermarked per investor. Share links are signed, expire in 15 minutes by default, and are revocable from the cockpit. NDAs are sealed with a SHA-256 hash stored in the database.

The concierge has prompt-injection scrubbing on every user input and refuses jailbreak attempts with a fixed phrase rather than answering.`,
  },
  {
    section: 'compliance',
    version: 'v1',
    text: `We are India-incorporated. Our primary mail region is Zoho India (smtp.zoho.in / imap.zoho.in). Our data lives in EU-region Postgres for GDPR friendliness even though our customer base is predominantly India today.

We do not sell or share customer data. We do not train any model on customer content. The Anthropic API contract we operate under explicitly prohibits training on submitted prompts.

For SOC2 — we are in the "ready to start" phase. We have all the controls (audit logging, MFA, secret scanning, access reviews) in place; the formal type-2 audit is on the post-Series-A roadmap, not before.`,
  },
  {
    section: 'risks',
    version: 'v1',
    text: `The honest list of risks.

(1) AI provider concentration. We rely on Anthropic. Mitigation: the AI client is centralized in src/lib/ai/client.ts; switching providers is a one-week swap. We've already prototyped against an OpenAI fallback.

(2) Founder dependency on quality of writing. The concierge is only as good as the founder's corpus. Mitigation: we ship a "writing prompts" cockpit feature that drives founders to fill in gaps the concierge has flagged.

(3) Trust gap on first contact. Investors may not believe an AI is grounded. Mitigation: every answer cites the source section and version. We expose a "see what Priya read" link on every reply.

(4) Pricing pressure if a free competitor lands. Mitigation: our wedge is the integration depth (NDA + watermarked data room + cockpit), not the chat. A free chatbot does not replace our stack.

(5) Hiring in Bengaluru senior ML talent is competitive. Mitigation: founder Priya runs the ML stack; we hire to scale, not to start.`,
  },
  {
    section: 'roadmap',
    version: 'v1',
    text: `Public roadmap (no specific dates beyond the next two quarters).

Q2 2026: ship the calendar integration (Google Calendar deep link with three suggested slots), ship the meeting pre-brief generator (Strategist agent reads investor + firm + interactions, produces a one-page brief).

Q3 2026: ship the "round dashboard" public view — a single shareable link with the live commit chart, anonymized cap table delta, and target close date. Also ship custom NDA template upload for the Series plan.

Q4 2026: ship multi-language concierge (English + Hindi + Mandarin), ship Zoho/Google Workspace SSO for the cockpit.

Beyond that we leave open. We tune the roadmap to which features the beta founders ask for most often. The retrieval evaluation loop directly feeds the roadmap.`,
  },
  {
    section: 'tech_stack',
    version: 'v1',
    text: `The stack is deliberately boring on the infrastructure side and ambitious on the AI side.

Frontend: Next.js 15 App Router, TypeScript strict mode, Tailwind, shadcn/ui (Radix), Framer Motion. No SPA framework, no separate API server — Next handles both.

Backend: Next.js route handlers (Node runtime), Drizzle ORM, Postgres 16 with the pgvector extension, Lucia v3 for auth. Sessions live in Postgres.

Mail: Nodemailer over Zoho SMTP for outbound, imapflow for inbound. Sender is info@ootaos.com, India region.

AI: Anthropic Claude Haiku for the concierge (latency-optimized), Sonnet for the strategist, Haiku for the drafter. Embeddings are local (Xenova/multilingual-e5-small, 384 dim) — zero per-call cost.

Storage: Cloudflare R2 via the AWS S3 SDK for documents and signed PDFs.

Hosting: Railway. CI: GitHub Actions. Observability: structured logs to Railway with a per-call ai_logs row capturing tokens, latency, cost.`,
  },
  {
    section: 'ai_discipline',
    version: 'v1',
    text: `We treat AI as a serious system, not a feature. Seven hard rules, all enforced server-side:

(1) Retrieval-only. The concierge answers only from knowledge_chunks. No open-web browsing. No reliance on training data.

(2) Citations always. Every factual claim cites a chunk by section and version. No citation, no claim.

(3) No autonomous actions. AI never sends an email, never moves a pipeline stage, never edits a record. Drafts only.

(4) Cost cap. Every workspace has a monthly USD cap (default $50). Exceeding it disables AI features and emails the founder.

(5) Prompt-injection scrub. User input is scanned for injection patterns before concatenation into the prompt. Matches are neutralized.

(6) Versioned prompts. Every agent's prompt lives in /prompts/<agent>.md with a YAML frontmatter (model, version, temperature). The deployed version hash is logged with every call.

(7) Centralized client. All Anthropic calls go through src/lib/ai/client.ts. CI fails if any handler imports the SDK directly.`,
  },
  {
    section: 'gtm',
    version: 'v1',
    text: `Go to market is founder-led for the first 12 months.

We launch publicly via three channels: (1) founder-community LinkedIn and Twitter (where our ICP already posts about fundraising), (2) targeted sponsorships of founder events in Bangalore, Mumbai, Singapore, and Jakarta, (3) referrals from beta-customer founders who introduce us to the next two or three founders in their network.

Conversion cycle in beta: ~9 days from signup to first investor question handled, ~14 days from signup to first NDA signed through OotaOS. We track those two milestones as the activation north stars; founders who hit both within 30 days have 92% month-2 retention.

Paid acquisition starts in Q3 2026 once the organic playbook hits a $5K MRR floor.`,
  },
  {
    section: 'metrics_summary',
    version: 'v1',
    text: `Headline metrics today (Apr 2026):

Workspaces onboarded: 18.
Monthly active founders: 14 (78%).
Investor conversations handled: 340.
NDAs signed self-serve: 112.
Founder meetings booked: 64.
Concierge grounded-answer rate: 94%.
Hallucinations flagged in 90 days: 0.
Founder NPS: +62.
MRR (paid): not yet — public launch and pricing flip is May 2026.

We are deliberately pre-revenue in the public-launch sense. The 18 beta workspaces are on a free founder pilot. The first paying cohort begins May 2026.`,
  },
  {
    section: 'demo_access',
    version: 'v1',
    text: `Three ways to see the product.

(1) The fastest: ask Priya anything on this page. She is running on the production stack you would deploy if you backed us — the same model, the same retrieval, the same prompts.

(2) Sign the NDA (60 seconds) and walk into our own data room — the same room a founder customer would build for their investors.

(3) Book a 20-minute live walkthrough with Murali or Priya — we open the cockpit, show the pipeline, draft an investor reply live, and answer anything the recording would not.`,
  },
  {
    section: 'press_social_proof',
    version: 'v1',
    text: `We are deliberately quiet on press until public launch in May 2026.

Beta founders who have publicly endorsed us by name: three (their consent given for investor conversations on request, not for public quotation).

We have one signed founding-design-partner agreement with a Bengaluru-based seed fund — they use OotaOS to triage incoming founder pitches, an early sign that the platform's grounding discipline is useful on the buy side too.`,
  },
  {
    section: 'why_us',
    version: 'v1',
    text: `Why this team, this problem.

Murali has fundraised twice as a founding engineer and watched both founders burn weeks on logistics. He has felt the pain. He writes well, which matters because the platform's quality is bounded by the founder's writing — Murali is the canary on whether the platform amplifies a strong writer.

Priya has spent six years putting LLMs into adversarial production environments (fraud, document understanding). She brings the discipline that an AI investor relations tool requires: hard cost caps, hallucination evaluation, prompt versioning, injection defense. None of these are obvious; all of them are non-negotiable.

Together: the writer-CEO and the eval-CTO. The combination is rare and we believe necessary.`,
  },
  {
    section: 'investor_faq',
    version: 'v1',
    text: `Common investor questions, plain answers.

How is this different from a chatbot? Every answer cites a section the founder wrote. No open web. No model recall. Investors see the citations inline.

Is this a CRM? No, it sits on top of a CRM. We replace the lightweight CRM most early-stage founders use (Airtable, Notion).

Do you train on customer data? No. Anthropic's API contract prohibits training on prompts; we never feed customer content into a fine-tune.

What if Anthropic raises prices or shuts off access? Our client layer is provider-agnostic. We have prototyped against OpenAI and could swap in a week.

Is the data room secure? PDFs are watermarked per investor, share links expire in 15 minutes by default and are revocable, every download is audit-logged with IP and user agent.

Why mutual NDA? Because you, the investor, are also sharing thesis and intent with us. Mutual is the right default at this stage.

Where is data hosted? EU-region Postgres for GDPR friendliness. Mail through Zoho India. Documents on Cloudflare R2.

How do you handle very technical investor questions? The concierge defers gracefully and offers to book the founders. Murali and Priya answer technical questions live.`,
  },
  {
    section: 'meeting_booking',
    version: 'v1',
    text: `Booking a meeting takes about 30 seconds.

The investor lands on the lounge after signing the NDA, sees three suggested 20-minute slots in the next week (drawn from Murali's and Priya's Google Calendars), picks one, and confirms. We immediately send a calendar invite with a Google Meet link to both sides.

Before the meeting, the Strategist agent generates a one-page pre-brief — what we know about the firm, the investor's recent investments, the questions they have asked the concierge, and the documents they have viewed. The brief is in our cockpit; the founder reads it five minutes before the call.

After the meeting, the founder writes a two-line note in the cockpit and the lead's stage updates accordingly.`,
  },
  {
    section: 'metrics_to_watch',
    version: 'v1',
    text: `If you are tracking us between now and the next milestone, watch these.

(1) Paying workspaces by end of Q3 2026. Target: 50 paying.
(2) Median time from investor's first concierge question to NDA signature. Today: 4 minutes. Target: under 3.
(3) Concierge grounded-answer rate. Today: 94%. Target floor: 92% — below that triggers an evaluation sprint.
(4) Founder NPS. Today: +62. Target floor: +50.
(5) Hallucination flags from founders. Target: 0 in any rolling 90-day window. Triggers an emergency prompt revision if breached.
(6) Public launch (paid) — May 2026.
(7) $1M ARR — target H2 2027.`,
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
