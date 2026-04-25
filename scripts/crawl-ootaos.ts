/**
 * Crawl ootaos.com (or any seed URL) BFS depth-1 same-origin, ingest each
 * page as a knowledge_chunks section. Idempotent via kb_ingest_log dedupe.
 *
 * Usage:
 *   pnpm tsx scripts/crawl-ootaos.ts
 *   pnpm tsx scripts/crawl-ootaos.ts --seed https://ootaos.com --max 30
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seed = flag('--seed') ?? 'https://ootaos.com/';
const maxPages = Number.parseInt(flag('--max') ?? '30', 10);
const userAgent = 'OotaOSInvestorBot/1.0 (+https://investors.ootaos.com)';

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function loadRobots(origin: string): Promise<(path: string) => boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': userAgent } });
    if (!res.ok) return () => true;
    const txt = await res.text();
    const lines = txt.split('\n').map((l) => l.trim());
    let active = false;
    const disallow: string[] = [];
    for (const line of lines) {
      if (/^User-agent:/i.test(line)) {
        const ua = line.split(':')[1]?.trim() ?? '';
        active = ua === '*' || ua.toLowerCase() === 'ootaosinvestorbot';
        continue;
      }
      if (active && /^Disallow:/i.test(line)) {
        const path = line.split(':')[1]?.trim() ?? '';
        if (path) disallow.push(path);
      }
    }
    return (path: string) => disallow.every((p) => !path.startsWith(p));
  } catch {
    return () => true;
  }
}

function extractLinks(baseUrl: string, html: string, allowedOrigin: string): string[] {
  const out = new Set<string>();
  const re = /<a\s+[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!href) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.origin !== allowedOrigin) continue;
      if (u.pathname.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|css|js)$/i)) continue;
      u.hash = '';
      out.add(u.toString());
    } catch {
      /* skip */
    }
  }
  return Array.from(out);
}

async function main() {
  const { extractHtml } = await import('@/lib/ingest/extractors/html');
  const { sha256 } = await import('@/lib/ingest/dedupe');
  const { workspacesRepo } = await import('@/lib/db/repos/workspaces');
  const { usersRepo } = await import('@/lib/db/repos/users');
  const { kbIngestLogRepo } = await import('@/lib/db/repos/kb-ingest-log');
  const { ingestKnowledge } = await import('@/lib/services/knowledge');

  const workspace = await workspacesRepo.default();
  if (!workspace) {
    console.error('[crawl] no default workspace — run `pnpm db:seed` first');
    process.exit(1);
  }
  const user = await usersRepo.firstInWorkspace(workspace.id);
  const actorUserId = user?.id ?? workspace.id;

  const seedUrl = new URL(seed);
  const origin = seedUrl.origin;
  const robotsAllow = await loadRobots(origin);

  const queue: string[] = [seedUrl.toString()];
  const seen = new Set<string>();
  let totalChunks = 0;
  let pages = 0;

  while (queue.length > 0 && pages < maxPages) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const path = new URL(url).pathname;
    if (!robotsAllow(path)) {
      console.log(`  ${url} … skipped (robots.txt)`);
      continue;
    }
    process.stdout.write(`  ${url} … `);
    const html = await fetchText(url);
    if (!html) {
      console.log('skipped (non-HTML or fetch failed)');
      continue;
    }
    pages++;

    // Extract & ingest with replace-by-source semantics so re-crawling
    // a page picks up the latest content and discards stale chunks.
    try {
      const { knowledgeChunksRepo } = await import('@/lib/db/repos/knowledge-chunks');
      const sections = extractHtml(url, html);
      let chunks = 0;
      for (const sec of sections) {
        const hash = sha256(`${sec.source}::${sec.text}`);
        const existing = await kbIngestLogRepo.getBySource(workspace.id, sec.source);
        if (existing && existing.contentSha256 === hash) continue;
        if (existing) {
          await knowledgeChunksRepo.wipeBySource(workspace.id, sec.source);
          await knowledgeChunksRepo.wipeBySourceFile(workspace.id, sec.source);
        }
        const result = await ingestKnowledge({
          workspaceId: workspace.id,
          actorUserId,
          section: sec.section,
          version: sec.version,
          text: sec.text,
          metadata: { ...(sec.metadata ?? {}), source: sec.source },
        });
        await kbIngestLogRepo.upsertSource({
          workspaceId: workspace.id,
          source: sec.source,
          section: sec.section,
          contentSha256: hash,
          chunkCount: result.inserted,
        });
        chunks += result.inserted;
      }
      totalChunks += chunks;
      console.log(`${chunks} chunks`);
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }

    // Enqueue same-origin links
    const links = extractLinks(url, html, origin);
    for (const link of links) {
      if (!seen.has(link) && queue.length + pages < maxPages) queue.push(link);
    }
  }

  console.log(`[crawl] done — ${pages} pages, ${totalChunks} chunks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
