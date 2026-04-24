# OotaOS Investor Wonderland

**An AI-native investor relations platform.** Where investors don't read pitches — they have conversations.

- Hosting: Railway
- Mail: Zoho SMTP / IMAP (`info@ootaos.com`)
- AI: Anthropic Claude (Haiku 4.5 concierge, Sonnet 4.6 drafter)
- Stack: Next.js 16 (App Router) · TypeScript strict · Drizzle + Postgres + pgvector · Lucia v3 · Tailwind 4 + shadcn/ui · Cloudflare R2

Source of truth: `../OotaOS-Investor-Wonderland-SRS-v2.0.docx` (kept outside the repo).

## Quickstart

```bash
pnpm install
cp .env.example .env.local          # then fill in values
docker compose up -d postgres       # starts Postgres 16 with pgvector
pnpm dev
```

## Scripts

| Script                              | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `pnpm dev`                          | Next.js dev server                     |
| `pnpm build`                        | Production build                       |
| `pnpm lint`                         | ESLint with zero-warnings policy       |
| `pnpm typecheck`                    | `tsc --noEmit` against strict tsconfig |
| `pnpm format` / `pnpm format:check` | Prettier write / verify                |

## Conventions

- No `any`. No `process.env` reads — import `env` from `@/lib/env`.
- Every API route enforces: auth → rate limit → validation → handler → audit.
- AI is a co-pilot, never an autopilot. Every AI output is gated by a human click.
- No popups, no auto-play, no chatbot bubbles. The investor types first.

See the `ootaos-builder` skill (`~/.claude/skills/ootaos-builder/SKILL.md`) for the full build contract.
