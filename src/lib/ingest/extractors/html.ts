import * as cheerio from 'cheerio';

import { type ExtractedSection } from '@/lib/ingest/extractors/types';

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/g, '').replace(/^\/+/, '') || 'home';
    return path.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  } catch {
    return 'page';
  }
}

/**
 * Extract readable text from an HTML page. Strips nav, header, footer,
 * script, style, noscript, and aside blocks. Returns one section.
 */
export function extractHtml(url: string, html: string): ExtractedSection[] {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, aside, form, iframe').remove();

  // Prefer <main>, then <article>, then <body>.
  const root = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  const title = $('title').first().text().trim();
  const text = root
    .text()
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (text.length < 80) return [];

  const slug = slugFromUrl(url);
  const composed = title ? `# ${title}\n\n${text}` : text;
  return [
    {
      source: url,
      section: `web_${slug}`,
      version: new Date().toISOString().slice(0, 10),
      text: composed,
      metadata: { format: 'html', url, title },
    },
  ];
}
