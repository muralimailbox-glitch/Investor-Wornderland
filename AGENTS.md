# AGENTS.md

This repo is built and maintained with AI agent assistance (Claude Code via the `ootaos-builder` skill).

The guardrails in `CLAUDE.md` apply to every agent. Read them before making any change.

Key rule: agents may propose and implement code, but any commit touching `prompts/**`, `drizzle/migrations/**`, or `src/lib/security/**` requires a human approver named in the PR description.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js 16 notice

This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
