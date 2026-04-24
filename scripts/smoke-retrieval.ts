import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { retrieve } = await import('@/lib/ai/retrieve');
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('no default workspace — run `pnpm db:seed`');
    process.exit(1);
  }

  const probes = [
    'what is OotaOS',
    'how much is the team raising',
    'who are the founders',
    'what is traction',
    'when are you closing',
  ];

  let anyHit = false;
  for (const q of probes) {
    const hits = await retrieve(workspace.id, q, { topK: 3, minSimilarity: 0.4 });
    console.log(
      `  ? "${q}" → ${hits.length} hits (top sim=${hits[0]?.similarity.toFixed(3) ?? 'n/a'})`,
    );
    if (hits.length > 0) anyHit = true;
  }

  if (!anyHit) {
    console.error('no chunks matched any probe — knowledge may be unseeded');
    process.exit(2);
  }
  console.log('retrieval smoke ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
