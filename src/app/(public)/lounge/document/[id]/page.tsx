import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { documentsRepo } from '@/lib/db/repos/documents';
import { leads } from '@/lib/db/schema';
import {
  renderDocxToHtml,
  renderMdToHtml,
  renderPdfToInline,
  renderPptxToHtml,
  renderXlsxToHtml,
} from '@/lib/ingest/extractors/html-render';
import { getStorage } from '@/lib/storage';

import { DocPreviewClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DocumentPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const session = readNdaSession(jar.get('ootaos_nda')?.value);
  if (!session) redirect('/nda');

  const leadRow = await db
    .select({ workspaceId: leads.workspaceId })
    .from(leads)
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const workspaceId = leadRow[0]?.workspaceId;
  if (!workspaceId) notFound();

  const doc = await documentsRepo.byId(workspaceId, id);
  if (!doc) notFound();

  const ext = (doc.originalFilename.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
  let html = '';
  let warnings: string[] = [];

  try {
    const buffer = Buffer.from(await getStorage().get(doc.r2Key));
    if (ext === '.docx') {
      ({ html, warnings } = await renderDocxToHtml(buffer));
    } else if (ext === '.xlsx') {
      ({ html, warnings } = await renderXlsxToHtml(buffer));
    } else if (ext === '.pptx') {
      ({ html, warnings } = await renderPptxToHtml(buffer));
    } else if (ext === '.md') {
      ({ html, warnings } = await renderMdToHtml(buffer));
    } else if (ext === '.pdf') {
      ({ html } = await renderPdfToInline(buffer));
    } else {
      html = `<p>This document type (<code>${ext || 'unknown'}</code>) cannot be previewed inline. Use the download link to open it.</p>`;
    }
  } catch (err) {
    html = `<p class="text-rose-700">We could not render this document. ${err instanceof Error ? err.message : String(err)}</p>`;
  }

  const watermarkLabel = `${session.email} · OotaOS · Confidential`;

  return (
    <main className="relative flex-1 overflow-hidden bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <Link href="/lounge" aria-label="Back to data room" className="flex items-center">
          <Image
            src="/brand/oota-rect-tagline.png"
            alt="OotaOS"
            width={320}
            height={82}
            priority
            className="h-14 w-auto"
          />
        </Link>
        <Link href="/lounge" className="text-sm text-violet-700 hover:text-violet-900">
          ← Back to data room
        </Link>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16 pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {doc.originalFilename}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Preview · watermarked for {session.email} · request the original below if you want a
            sealed copy
          </p>
        </div>

        <DocPreviewClient
          documentId={doc.id}
          filename={doc.originalFilename}
          html={html}
          isPdf={ext === '.pdf'}
          watermarkLabel={watermarkLabel}
          warnings={warnings}
        />
      </section>
    </main>
  );
}
