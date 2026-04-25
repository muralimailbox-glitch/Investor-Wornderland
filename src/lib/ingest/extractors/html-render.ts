/**
 * In-browser-friendly renderers that take a binary document buffer and
 * produce sanitized HTML for the data-room preview page. Different from
 * the ingest extractors (which produce plain text for embedding) — these
 * preserve formatting (headings, tables, bold, lists).
 */
import { Buffer } from 'node:buffer';

export type RenderedDoc = { html: string; warnings: string[] };

/**
 * Strip script/style/event-handler attributes from HTML so we can safely
 * embed it in the page. Sufficient for trusted internal documents.
 */
function sanitize(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export async function renderDocxToHtml(buffer: Buffer): Promise<RenderedDoc> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  return {
    html: sanitize(result.value ?? ''),
    warnings: (result.messages ?? []).map((m) => m.message ?? String(m)),
  };
}

export async function renderXlsxToHtml(buffer: Buffer): Promise<RenderedDoc> {
  const xlsxModule = await import('xlsx');
  const xlsx = (xlsxModule as unknown as { default?: typeof xlsxModule }).default ?? xlsxModule;
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const html = xlsx.utils.sheet_to_html(sheet, { header: '', footer: '' });
    parts.push(
      `<section class="oota-sheet"><h2>${name.replace(/[<>&]/g, '')}</h2>${sanitize(html)}</section>`,
    );
  }
  return { html: parts.join('\n'), warnings: [] };
}

export async function renderPptxToHtml(buffer: Buffer): Promise<RenderedDoc> {
  const op = (await import('officeparser')) as unknown as {
    default?: { parseOfficeAsync: (b: Buffer | string) => Promise<string> };
    parseOfficeAsync?: (b: Buffer | string) => Promise<string>;
  };
  const parser = op.default ?? op;
  if (!parser?.parseOfficeAsync) throw new Error('officeparser unavailable');
  const text = await parser.parseOfficeAsync(buffer);
  // Heuristic: officeparser concatenates slide text; split on triple-newlines
  // (common slide separator) then on double-newlines (paragraph) to render
  // a slide-per-section preview.
  const slides = text
    .split(/\n{3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = slides.map((slide, i) => {
    const paras = slide
      .split(/\n{2,}/)
      .map((p) => p.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c));
    return `<section class="oota-slide"><h2>Slide ${i + 1}</h2>${paras
      .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
      .join('')}</section>`;
  });
  return { html: parts.join('\n'), warnings: [] };
}

export async function renderPdfToInline(_buffer: Buffer): Promise<RenderedDoc> {
  // PDFs are best served via the existing /api/v1/document/[id] route which
  // already watermarks. The preview page embeds an <iframe> pointing at that
  // route, so this renderer just returns a marker.
  return { html: '__PDF_IFRAME__', warnings: [] };
}

export async function renderMdToHtml(buffer: Buffer): Promise<RenderedDoc> {
  // Tiny markdown renderer: headings, paragraphs, bold, italic, lists, code.
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        out.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(escape(line));
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<h${h[1]?.length ?? 1}>${inline(h[2] ?? '')}</h${h[1]?.length ?? 1}>`);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(li[1] ?? '')}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    if (line.trim() === '') {
      out.push('');
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</code></pre>');
  return { html: sanitize(out.join('\n')), warnings: [] };
}

function escape(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c);
}
function inline(s: string): string {
  return escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}
