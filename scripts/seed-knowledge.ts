/**
 * Seed the default workspace's knowledge_chunks with the canonical OotaOS
 * narrative — every fact here is grounded in the Investor Pack documents
 * (Term Sheet, SSA, SHA, Cap Table, Financial Model, DD Questionnaire,
 * Pitch Deck, Patent Applications, ESOP Scheme, Founder Agreement, etc.).
 *
 * This is the FALLBACK content the AI uses when the full corpus ingest
 * (scripts/ingest-corpus.ts) hasn't been run — and it stays useful even
 * after corpus ingest because narrative summaries are easier to retrieve
 * than long legal prose. The corpus ingest layers the full document text
 * on top.
 *
 * Re-run any time: `pnpm seed:knowledge`.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const KNOWLEDGE: Array<{ section: string; version: string; text: string }> = [
  {
    section: 'company',
    version: 'v1',
    text: `OotaOS Platform Services Private Limited is the legal entity behind OotaOS — an Indian company incorporated under the Companies Act, 2013, headquartered in Bengaluru, Karnataka.

The product is an AI-native restaurant operating system: a single integrated stack that replaces the four-to-six disconnected tools a typical independent restaurant runs today (POS, QR ordering, reservations, kitchen display, inventory, marketing, HR).

We ship two product tiers from a shared codebase: OotaOS Regular for full-service restaurants and OotaOS Lite for street food vendors and food trucks. Both run on Railway with Postgres, deployed via the SnapSiteBuild infrastructure.`,
  },
  {
    section: 'one_liner',
    version: 'v1',
    text: `One sentence: OotaOS is the restaurant operating system — one integrated stack of POS, QR ordering, kitchen display, reservations, inventory, marketing, HR, and analytics, replacing the four-to-six disconnected tools restaurants juggle today.

The category we belong to is "vertical SaaS for restaurants" — operator-grade, India-first, AI-augmented. Not a payment app, not a delivery aggregator, not a marketplace. The system of record for the restaurant.`,
  },
  {
    section: 'problem',
    version: 'v1',
    text: `Independent restaurants run on 4–6 disconnected tools. POS, QR ordering, reservations, inventory, HR, marketing — all separate, all paid for separately, all siloed.

A typical owner pays four to six monthly bills, reconciles four to six dashboards, and has no single view of revenue, costs, or guests. Staff retype orders between systems. Inventory drifts because the POS doesn't see the kitchen. Marketing campaigns can't reach customers because contact data lives in three different places. Reservations conflict with walk-ins because the table map is on a whiteboard.

The owner is the integration layer. That doesn't scale, and it's why most restaurants never measure their unit economics with any rigour.`,
  },
  {
    section: 'product',
    version: 'v1',
    text: `OotaOS ships eight modules, all running on the same Postgres tenant and surfaced through one operator UI:

(1) POS — order entry with frozen prices at order creation, idempotent payment processing, multi-currency.
(2) QR Ordering — diners scan a sticker, browse the menu, build a cart, pay (Razorpay / Stripe / cash). Multi-user same-table sessions with merged billing.
(3) Kitchen Display System — orders route to stations in real time over Pusher, with polling fallback as the authoritative source of truth.
(4) Reservations + Waitlist — table holds, walk-in queue, predictive ETA computation feeding the kitchen dispatch.
(5) Inventory — sub-second real-time 86'd sync across all customer devices via geofenced inventory broadcasting.
(6) Marketing — referral programs, partner commissions, segmented campaigns from CRM data captured at every order.
(7) Reports & Finance — JSON, CSV, PDF, and accounting-grade revenue summaries from raw order + loyalty + discount streams.
(8) AI Support Investigator (AISI) — read-only Claude-Sonnet-backed agent that answers "what happened to my order / payment / KDS?" with PII masking and dual cost caps.`,
  },
  {
    section: 'tiers',
    version: 'v1',
    text: `Two product tiers from a shared codebase:

OotaOS Regular — full restaurant management for sit-down restaurants, cafes, casual dining, fine dining. POS + KDS + reservations + waitlist + inventory + marketing + reports. Three plans: Starter (pay-as-you-go), Growth (flat monthly), Pro (flat monthly with premium features).

OotaOS Lite — lightweight ordering for street food vendors, food trucks, dabbas, small eateries. Onboarding under two minutes, print a QR sticker, take orders. Indian payments via PhonePe UPI deep link with owner-confirm fallback. Reduced feature surface, simpler auth.

Both share Railway hosting, the same Postgres instance (different schemas), and the same Pusher realtime spine.`,
  },
  {
    section: 'pricing',
    version: 'v1',
    text: `OotaOS Regular runs three plan tiers with a 15-day trial across 10 currencies (Razorpay routes India, Stripe routes everything else):

Starter — pay-as-you-go. Per-order transaction fee. No monthly minimum. Designed for restaurants <₹2 lakh monthly revenue.
Growth — flat monthly subscription. Includes reservations, full reporting, and marketing campaigns. The plan most beta restaurants use.
Pro — flat monthly with premium features: multi-location, advanced reporting, white-label customer-facing UI, dedicated success engineer, custom integration support.

Trial is 15 days from signup. After trial, billing flips to past_due → unpaid after another 15 days, with a requireSubscription() middleware that gates premium features across the platform.`,
  },
  {
    section: 'team',
    version: 'v1',
    text: `Two founders.

Murali Krishna Chimakurthy is the Operating Founder and CEO. He owns customer-facing content, the AI guardrails, fundraising, and product direction. Bengaluru-based.

Jyothsna Chimakurthy is the Passive Shareholder and co-founder. She holds equity that traces back to a documented Gift Deed Of Equity Shares between spouses; her role is non-operating and is captured in the Founder Agreement as such.

First three planned hires post-funding are a VP Sales, two SDRs, and a Customer Success Lead — about 40% of the seed round flows into Sales and Onboarding.`,
  },
  {
    section: 'round',
    version: 'v1',
    text: `Seed round: USD 800,000 for 10% of the company at USD 8,000,000 post-money valuation. Pre-money valuation USD 7,200,000. FX rate ₹94/USD. INR equivalent of the round is ₹7.52 crore.

The round is structured as a primary equity issuance under Section 62(1)(c) of the Companies Act, 2013, with a 10% ESOP pool created pre-money via Special Resolution under Section 62(1)(b). All filings (PAS-3, MGT-14, FC-GPR if non-resident) are mapped in the Cap Table's MCA Filings sheet.

The Term Sheet, Share Subscription Agreement, and Shareholders' Agreement are the three execution documents. The Disclosure Letter sits beside them as the founder's qualifications to the warranties. The Cover Note (founder-only, kept out of the data room) explains how all the documents fit together.`,
  },
  {
    section: 'use_of_funds',
    version: 'v1',
    text: `The ₹7.52 crore (USD 800K) seed round is allocated across an 18-month runway:

Sales & Onboarding — 40% (₹3.0 crore / USD 320K). VP Sales, two SDRs, a Customer Success Lead, field sales costs, onboarding tools.
Marketing — 25% (₹1.88 crore / USD 200K). Digital campaigns, brand, content, referral programme, founder events.
Engineering — 25% (₹1.88 crore / USD 200K). Two senior full-stack hires, one ML engineer, design contractor, SaaS tooling.
Operations & buffer — 10% (₹0.76 crore / USD 80K). Legal, finance, audit, infrastructure cost ceiling, contingency.

We grow into a priced Series A at the milestone of approximately 1,500 paying restaurants and ₹2.5 Cr+ MRR.`,
  },
  {
    section: 'financial_projections',
    version: 'v1',
    text: `36-month projections in three scenarios (Conservative / Base / Aggressive). All numbers below are Base.

Starting point: 1 paying restaurant (current beta) at month 0.
Restaurant additions: 88/month in months 1–6, 190/month in months 7–12, 380/month in months 13–18, then 4-figure additions in months 19–36.

Active restaurants: 497 by month 6, 1,498 by month 12, 3,430 by month 18, 5,342 by month 24, 8,395 by month 36.
MRR: USD 74,550 (m6), USD 224,700 (m12), USD 565,950 (m18), USD 881,430 (m24), USD 1,523,693 (m36).
ARR at month 36: USD 18.28M (₹171.87 crore).

The model has a Cash Flow sheet showing opening cash, net flow, and closing cash month by month — the seed round closes a 18-month runway with a small buffer at the planned base burn.`,
  },
  {
    section: 'patents',
    version: 'v1',
    text: `Seven provisional patent applications have been drafted for filing with the Indian Patent Office (Form 1 + Form 2 each):

1. Dynamic QR Code Lifecycle Management for Restaurant Tables — the Smart QR Resolution Engine.
2. Multi-User Same-Table Digital Ordering and Merged Payment System — the Collaborative Table Session Engine.
3. Cross-Table Group Session Management with Multi-Party Billing — the Group Session and Corporate Invoice Engine.
4. Pre-Queue Waitlist System with Predictive Kitchen Dispatch and Dynamic ETA Computation — the Smart Waitlist and Kitchen Dispatch Engine.
5. Digital Service Request Relay System with Session-Aware Automation — the Call Waiter and Service Automation Engine.
6. Server-Side Price Integrity Enforcement and Idempotent Order Processing — the Anti-Tamper and Order Deduplication Engine.
7. Geofence-Validated Restaurant Ordering with Sub-Second Real-Time Inventory Synchronisation — the Location Validation and Live 86'd Sync Engine.

The full text of each is in the data room under Patent 1 through Patent 7. The IP Assignment Deed transfers all founder-created IP to the company prior to closing.`,
  },
  {
    section: 'tech_stack',
    version: 'v1',
    text: `OotaOS Regular runs Express + Vite — a deliberate pivot from the originally planned Next.js stack (documented in DECISIONS.md). Backend is TypeScript on Express, frontend is Vite-built React, database is Postgres on Railway with 15 migrations shipped (numbered 0000–0014). Realtime over Pusher with polling as the authoritative fallback.

OotaOS Lite shares the same Postgres instance under a different schema with reduced auth and feature surface, enabling sub-2-minute onboarding for street food vendors.

Production readiness is approximately 87% as of April 2026 — see PRODUCTION_READINESS_2026-04-18.md for per-module scores. Multi-tenancy is enforced at every DB query (every tenant-scoped table requires AND restaurant_id = $sessionRestaurantId), and a CI grep blocks any commit that omits it.`,
  },
  {
    section: 'security_compliance',
    version: 'v1',
    text: `Security is built in, not bolted on. Every API handler validates input with Zod, applies rate limits, and writes an audit event on state-changing actions. Sessions are HttpOnly + Secure cookies. Per-restaurant Razorpay keys are encrypted at rest; Stripe runs platform keys only.

OTP is email-only since 2026-04-18 (SMS OTP returns 410 Gone), eliminating telecom-side credential exposure. PII masking is enforced in the AI Support Investigator. Cross-tenant access is structurally impossible: every request resolves a single sessionRestaurantId and every query carries it.

Compliance: India-incorporated, GDPR-friendly Postgres in EU region, no training on customer data (Anthropic API contract prohibits it). SOC2 type-2 is on the post-Series-A roadmap; controls (audit logging, MFA, secret scanning, access reviews) are already in place.`,
  },
  {
    section: 'cap_table',
    version: 'v1',
    text: `Three-stage cap table: incorporation → ESOP creation → seed round closing.

Stage 1 (At incorporation): the two founders hold 10,000 pre-money shares between them, with the spousal Gift Deed already executed.

Stage 2 (After ESOP): a 10% ESOP pool is created pre-money via Special Resolution under Section 62(1)(b), bringing the fully-diluted share count to 11,111.

Stage 3 (After seed): the lead investor subscribes to new shares for 10% of the post-money cap table at USD 8M post / USD 7.2M pre. Founders + ESOP + investor sum to 100% of the post-money fully-diluted total.

The full Detailed Cap Table sheet shows shares, percentages, and INR/USD valuations at each stage. The Valuation Math sheet derives every number arithmetically — investor's CA can verify in five minutes.`,
  },
  {
    section: 'governance',
    version: 'v1',
    text: `Governance flows through the Shareholders' Agreement (SHA) executed alongside the Share Subscription Agreement (SSA).

Board: founder-controlled at seed; one investor observer seat on request. Reserved matters list aligned with the Term Sheet — material asset transfers, material related-party transactions, change of business, and budget approval require investor consent.

Information rights: monthly management accounts, quarterly financial statements, annual audited statements, board materials at least 5 business days before meetings.

ESOP grants vest over four years with a one-year cliff per the ESOP Scheme. The Plan was prepared as a clean Section 62(1)(b) document and is intended to be filed alongside the seed paperwork.

Founders have an 18-month vesting reset on round close, with 25% vested at close to acknowledge prior service.`,
  },
  {
    section: 'risks',
    version: 'v1',
    text: `Honest list of risks documented in the DD Questionnaire.

Founder concentration. Two founders, one operating, one passive — the Operating Founder is the system. Mitigation: knowledge captured in DECISIONS.md, CLAUDE.md, and the per-module design docs (00-OVERVIEW through 22-Staff-Roles). First two senior engineering hires are funded for redundancy.

AI provider concentration. AISI uses Anthropic Claude. Mitigation: provider-agnostic client layer, prototyped against OpenAI fallback.

Payment provider concentration in India. Razorpay is the primary route. Mitigation: PhonePe UPI deep link is wired for Lite, and Stripe carries international flow; Razorpay is one of three.

Operational risk: 87% production readiness implies real residual debt. The PRODUCTION_READINESS_2026-04-18.md report scores each module so the gap to 100% is measurable, not aspirational.

Regulatory risk: SaaS over a payment surface invites RBI and state-level scrutiny. Mitigation: per-restaurant encrypted Razorpay keys, no platform-managed funds float, no nodal-account flow.`,
  },
  {
    section: 'gtm',
    version: 'v1',
    text: `Go-to-market is founder-led for the first 12 months, then hires a VP Sales. Three channels:

(1) Direct field sales — the VP Sales and SDRs walk into restaurants in Bengaluru, Hyderabad, Mumbai, and Pune. India-first because the product is built for Indian payment rails (Razorpay, PhonePe UPI) and Indian regulatory constraints (FEMA, GST).

(2) Marketing partner program — external affiliates earn commission as a percentage of the SaaS revenue their referred restaurants generate. Self-service partner portal with a unique referral code per partner.

(3) Lite-led acquisition — street food vendors and food trucks onboard themselves via the Lite product (under two minutes, one QR sticker), and a portion graduate to Regular as their operations grow.

The 15-day trial is the conversion event. Activation north stars are first-order-placed and first-week-of-orders, with month-2 retention as the primary KPI.`,
  },
  {
    section: 'data_room_index',
    version: 'v1',
    text: `The investor data room contains 14 transaction documents and 30 supporting design / patent documents. The transaction set:

Cover Note (founder-only — describes how the documents fit together).
Pitch Deck v3.
Cap Table — Summary, Detailed, Valuation Math, Future Rounds, MCA Filings.
Financial Model — README, Assumptions, Scenario, Revenue, Costs, P&L, Cash Flow, KPIs, Use of Funds.
DD Questionnaire — founder-prepared answers to standard investor diligence questions.
Term Sheet — USD 800K for 10% at USD 8M post-money.
Share Subscription Agreement.
Shareholders' Agreement.
Disclosure Letter — founder qualifications to SSA / SHA warranties.
ESOP Scheme and Resolutions — Section 62(1)(b) plan, ready for filing.
Founder Agreement — Operating + Passive founder roles, vesting reset on close.
IP Assignment Deed — pre-close transfer of founder IP to the company.
Gift Deed — spousal equity transfer establishing the Passive Shareholder's holding.
Cross-Promotion Agreement — strategic agreement with SnapSiteBuild for co-marketing.

Plus seven Provisional Patent Applications (Indian Patent Office Form 1 + Form 2) and twenty-two design / module documents covering the technical architecture from auth to staff roles.`,
  },
  {
    section: 'concierge_meta',
    version: 'v1',
    text: `Priya is OotaOS's AI concierge — built on Claude Opus 4.7, grounded in this knowledge base, with mandatory inline citations on every factual claim.

She handles the public narrative freely: what OotaOS does, the team, the round size, the high-level use of funds. The moment a question goes deep into specific cap-table line items, deal terms, named customer contracts, or unfiled IP, she invites the investor to verify their email and sign the 60-second mutual NDA before sharing the original documents.

She refuses jailbreaks and prompt-injection attempts with a single line and an offer to book the founders directly. She never sends mail, never moves a stage, never edits a record. AI drafts; humans press buttons.`,
  },
  {
    section: 'meeting_booking',
    version: 'v1',
    text: `Booking a meeting takes about 30 seconds.

Available slots are between 8 AM and 8 PM IST (Indian Standard Time, UTC+5:30), excluding the founder's standing breaks: breakfast (8–9 AM IST), lunch (12 PM – 1:30 PM IST), and dinner (7 PM – 8 PM IST). Effective booking windows are therefore 9:00–12:00 IST and 13:30–19:00 IST, Monday through Saturday.

Minimum advance notice is 20 hours — slots within the next 20 hours of the investor's click-time are unavailable. Maximum lead time is 14 days.

The investor sees the slot rendered in their local timezone alongside IST, so there is no ambiguity. After confirmation, both parties get a calendar invite. A pre-brief is generated automatically by the Strategist agent and lands in the founder's cockpit five minutes before the call.`,
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

  const wipe = process.argv.includes('--wipe');
  if (wipe) {
    console.log(`wiping knowledge for workspace ${workspace.id}`);
    await wipeKnowledge(workspace.id, actorUserId);
  }

  console.log(`seeding ${KNOWLEDGE.length} curated sections for workspace ${workspace.id}`);
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
