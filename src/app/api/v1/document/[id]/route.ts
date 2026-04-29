import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { getDocumentForSession } from '@/lib/services/lounge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdParam = z.string().uuid();

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LEGACY_DOC_MIME = 'application/msword';

/**
 * Pre-legal-review banner shown above every docx HTML preview. Investor
 * comms requirement: data-room docx files are converted with mammoth and
 * shown inline so investors don't have to download Word to read them, but
 * none of these have been signed off by legal yet — the banner prevents
 * the rendered text from being treated as a final document.
 */
const PRELEGAL_NOTICE = `
<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:12px 16px;margin:0 0 20px 0;color:#9A3412;font-size:13px;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <strong>Pre-legal-review draft.</strong> This document has not yet been
  reviewed by our legal team. The browser preview is for reading
  convenience; download the original .docx for the canonical version.
</div>`;

const PREVIEW_HTML_HEAD = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 780px; margin: 32px auto; padding: 0 24px; color: #0F172A; line-height: 1.65; }
    h1, h2, h3 { letter-spacing: -0.01em; }
    h1 { font-size: 28px; margin: 24px 0 12px; }
    h2 { font-size: 22px; margin: 24px 0 10px; }
    h3 { font-size: 18px; margin: 20px 0 8px; }
    p { margin: 0 0 14px; }
    table { border-collapse: collapse; margin: 16px 0; width: 100%; }
    th, td { border: 1px solid #E2E8F0; padding: 8px 10px; text-align: left; }
    img { max-width: 100%; height: auto; }
    a { color: #C026D3; }
  </style>
</head>
<body>`;

const PREVIEW_HTML_FOOT = `</body></html>`;

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'document:get', perMinute: 60 });
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = IdParam.parse(segments[segments.length - 1]);

  const { bytes, filename, mimeType } = await getDocumentForSession(id);
  const wantsHtml = url.searchParams.get('preview') === 'html';
  const lower = filename.toLowerCase();
  const isDocx =
    mimeType === DOCX_MIME ||
    mimeType === LEGACY_DOC_MIME ||
    lower.endsWith('.docx') ||
    lower.endsWith('.doc');

  // HTML preview path — convert docx to inline HTML so investors can read
  // the document in-browser without Word installed. The original .docx
  // stays downloadable via the same endpoint without the preview flag.
  // Falls back to the binary path on any conversion failure so a malformed
  // docx never breaks the data room.
  if (wantsHtml && isDocx) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      const html = `${PREVIEW_HTML_HEAD}${PRELEGAL_NOTICE}${result.value}${PREVIEW_HTML_FOOT}`;
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          // Lock down the iframe — preview HTML is rendered in a sandboxed
          // <iframe>, but the CSP keeps the rendered doc from beaconing
          // even if a malicious docx slipped a remote <img> through.
          'Content-Security-Policy':
            "default-src 'none'; img-src data: blob: 'self'; style-src 'unsafe-inline'; font-src 'self' data:;",
        },
      });
    } catch (err) {
      console.warn('[document:get] mammoth preview failed — serving binary', err);
      // Fall through to the binary path so the investor can still download.
    }
  }

  const body = new Uint8Array(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
