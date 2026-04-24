# CLAUDE.md — working notes for Claude agents on this repo

Read first: `../OotaOS-Investor-Wonderland-SRS-v2.0.docx` (the SRS — the source of truth).
Then: `~/.claude/skills/ootaos-builder/SKILL.md` (the build contract).

## Non-negotiables

1. **No invented code.** Verify every import against installed packages or your own files.
2. **No phantom integrations.** Backend handler ships with its frontend caller; schema ships with its migration.
3. **No skipped layers.** Every feature: schema → migration → repo → service → API → client → UI → test.
4. **No retrofit security.** Auth + rate limit + Zod + audit on every state-changing route, at birth.
5. **No secrets in code.** Everything goes through `@/lib/env`.
6. **No silent AI.** Every Anthropic call logs `(workspace, model, tokens, cost, latency)`. Central client only.
7. **No autonomous AI action.** AI drafts. The founder sends.

## Build order (see SKILL.md §3 for gates)

`0 Foundation → 1 Database → 2 Auth+Security → 3 Integrations → 4 API → 5 AI → 6 Frontend → 7 Hardening+Deploy`

If a gate fails, stop. Fix the lowest broken layer first. Do not add features on top of broken foundations.

## Framework notes

Next.js 16 App Router — APIs may differ from Next 14-and-below training data. When in doubt, read `node_modules/next/dist/docs/` or the official docs. Do not write imports from memory.

## What sits outside the repo

- The SRS `.docx`, the `Investor Pack/`, the `Design Documents old/`, and the `Logos/` folder live one level up.
- The investor-pack documents become **knowledge-base seed content** for the AI concierge at deploy time — they are not application code.
- OotaOS-the-product (restaurant/hospitality OS) is a separate codebase entirely. This repo only builds the investor-facing platform.
