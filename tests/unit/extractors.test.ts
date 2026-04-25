import { describe, expect, it } from 'vitest';

import { cosineSim, dedupeByEmbedding, sha256 } from '@/lib/ingest/dedupe';
import { extractHtml } from '@/lib/ingest/extractors/html';
import { sectionFromFilename } from '@/lib/ingest/extractors/types';

describe('extractor.types.sectionFromFilename', () => {
  it('strips OotaOS_ prefix and lowercases', () => {
    expect(sectionFromFilename('OotaOS_Term_Sheet.docx')).toBe('term_sheet');
    expect(sectionFromFilename('OotaOS_Cap_Table.xlsx')).toBe('cap_table');
    expect(sectionFromFilename('00-OVERVIEW.md')).toBe('00_overview');
  });
});

describe('extractor.html', () => {
  it('extracts main content and skips nav/footer/scripts', () => {
    const html = `<!doctype html><html><head><title>OotaOS</title></head><body>
      <nav><a href="/about">About</a></nav>
      <main>
        <h1>Real Content</h1>
        <p>OotaOS turns a fundraise into a conversation. Investors ask anything, our AI answers from the founder's writing with citations.</p>
      </main>
      <script>window.x=1</script>
      <footer>copyright</footer>
    </body></html>`;
    const out = extractHtml('https://ootaos.com/', html);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toContain('Real Content');
    expect(out[0]?.text).toContain('OotaOS turns a fundraise');
    expect(out[0]?.text).not.toContain('window.x');
    expect(out[0]?.text).not.toContain('copyright');
    expect(out[0]?.section).toBe('web_home');
  });

  it('returns empty for thin pages', () => {
    const out = extractHtml('https://ootaos.com/thin', '<html><body></body></html>');
    expect(out).toHaveLength(0);
  });
});

describe('dedupe', () => {
  it('sha256 is deterministic', () => {
    expect(sha256('foo')).toBe(sha256('foo'));
    expect(sha256('foo')).not.toBe(sha256('bar'));
  });

  it('cosineSim of identical unit vectors is 1', () => {
    const v: number[] = [];
    for (let i = 0; i < 10; i++) v.push(0);
    v[0] = 1;
    expect(cosineSim(v, v)).toBeCloseTo(1, 5);
  });

  it('dedupeByEmbedding drops near-duplicates above threshold', () => {
    const a: number[] = [];
    for (let i = 0; i < 8; i++) a.push(0);
    a[0] = 1;
    const b: number[] = [];
    for (let i = 0; i < 8; i++) b.push(0);
    b[0] = 0.99;
    b[1] = 0.14;
    const c: number[] = [];
    for (let i = 0; i < 8; i++) c.push(0);
    c[7] = 1;
    const keep = dedupeByEmbedding([a, b, c], 0.92);
    expect(keep).toContain(0);
    expect(keep).not.toContain(1); // near-dup of a
    expect(keep).toContain(2); // distinct
  });
});
