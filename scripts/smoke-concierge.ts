import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * One-shot end-to-end smoke test for the investor concierge.
 * Imports the same `runConcierge` the /api/v1/ask route uses, so a green run
 * proves: env wiring → Anthropic key → model resolution → retrieval →
 * response shape. Run with `pnpm tsx scripts/smoke-concierge.ts`.
 */
async function main() {
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { runConcierge } = await import('@/lib/ai/agents/concierge');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('no default workspace — run `pnpm db:seed`');
    process.exit(1);
  }

  const questions = [
    'What does OotaOS do in one sentence?',
    'How much is the team raising and at what valuation?',
    'Who are the founders and where are they based?',
  ];

  for (const q of questions) {
    console.log('\n──────────────────────────────────────────────');
    console.log(`Q: ${q}`);
    const start = Date.now();
    const result = await runConcierge({
      workspaceId: workspace.id,
      sessionId: `smoke-${Date.now()}`,
      question: q,
      history: [],
      signedNda: false,
      investor: null,
    });
    const ms = Date.now() - start;
    console.log(`Model: ${result.model} · ${ms}ms`);
    console.log(
      `Citations: ${result.citations.length} (${result.citations.map((c) => c.section).join(', ')})`,
    );
    console.log(
      `Refused: ${result.refused}${result.refusalReason ? ` (${result.refusalReason})` : ''}`,
    );
    console.log(`Answer:\n${result.answer}`);
  }
  console.log('\nconcierge smoke ok');
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
