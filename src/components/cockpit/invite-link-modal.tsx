'use client';

import { useEffect, useState } from 'react';
import {
  Copy,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  ShieldOff,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

type Props = {
  investorId: string;
  investorName: string;
  investorEmail: string;
  investorMobileE164?: string | null;
  onClose: () => void;
};

type Issued = { url: string; expiresAt: string; investorEmail: string };

export function InviteLinkModal({
  investorId,
  investorName,
  investorEmail,
  investorMobileE164,
  onClose,
}: Props) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [introLine, setIntroLine] = useState('');
  const [copied, setCopied] = useState(false);

  // Issue a link on open. Idempotent — server signs a fresh JWT each call.
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      fetch(`/api/v1/admin/investors/${investorId}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sendEmail: false }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as Issued;
        })
        .then((j) => {
          if (alive) setIssued(j);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    });
    return () => {
      alive = false;
    };
  }, [investorId]);

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard blocked — copy manually from the box above.');
    }
  }

  async function sendEmail() {
    setEmailing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/investors/${investorId}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sendEmail: true,
          ...(introLine.trim() ? { introLine: introLine.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as Issued;
      setIssued(j);
      setEmailed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setEmailing(false);
    }
  }

  function whatsappHref(): string | null {
    if (!issued || !investorMobileE164) return null;
    const text = encodeURIComponent(
      `Hi ${investorName.split(' ')[0] ?? ''} — here's your private OotaOS investor lounge link: ${issued.url}\n\nSign the NDA once and the data room + founder calendar open immediately.`,
    );
    return `https://wa.me/${investorMobileE164.replace(/\D/g, '')}?text=${text}`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-rose-50 px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Invite link
            </p>
            <p className="text-sm font-semibold text-slate-900">{investorName}</p>
            <p className="text-[11px] text-slate-500">{investorEmail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition hover:bg-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Signing a fresh link…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : issued ? (
            <>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Private link (14-day expiry)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={issued.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Expires {new Date(issued.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {whatsappHref() ? (
                  <a
                    href={whatsappHref() ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Open in WhatsApp
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="No mobile on file"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    No WhatsApp number
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void sendEmail()}
                  disabled={emailing}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
                >
                  {emailing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  {emailed ? 'Email sent — send again' : 'Email this link to investor'}
                </button>
              </div>

              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Customise the email intro line (optional)
                </summary>
                <textarea
                  value={introLine}
                  onChange={(e) => setIntroLine(e.target.value)}
                  rows={3}
                  maxLength={600}
                  placeholder="Default: Here's your private link to the OotaOS investor lounge — sign the NDA once and the data room, founder calendar, and AI concierge open to you."
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </details>

              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                <Sparkles className="mr-1 inline h-3 w-3 text-violet-500" />
                The link signs them in as <strong>{investorName}</strong> — they don&apos;t need a
                password. Each click extends their cookie session for 14 days.
              </p>

              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px]">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  Privacy &amp; revocation
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={`/api/v1/admin/investors/${investorId}/export`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Download className="h-3 w-3" /> GDPR export
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !confirm(
                          'Revoke every magic link previously issued to this investor? Existing cookies become invalid immediately.',
                        )
                      )
                        return;
                      const res = await fetch(
                        `/api/v1/admin/investors/${investorId}/revoke-links`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({}),
                        },
                      );
                      if (res.ok)
                        alert('All links revoked. Issue a new one above to grant access again.');
                      else alert('Revoke failed.');
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    <ShieldOff className="h-3 w-3" /> Revoke all links
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const reason = prompt('Reason for anonymise (optional):') ?? '';
                      if (
                        !confirm(
                          `Anonymise this investor? PII (name, email, mobile) is replaced with redacted markers; aggregate metrics + history survive for compliance. The row stays in the list as "redacted —".`,
                        )
                      )
                        return;
                      const res = await fetch(`/api/v1/admin/investors/${investorId}/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          confirm: true,
                          mode: 'anonymise',
                          ...(reason.trim() ? { reason: reason.trim() } : {}),
                        }),
                      });
                      if (res.ok) {
                        alert('Investor anonymised.');
                        onClose();
                      } else {
                        const j = (await res.json().catch(() => null)) as {
                          title?: string;
                        } | null;
                        alert(`Anonymise failed: ${j?.title ?? res.status}`);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    <Trash2 className="h-3 w-3" /> Anonymise (GDPR)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const reason = prompt('Reason for permanent deletion (optional):') ?? '';
                      if (
                        !confirm(
                          `Permanently delete this investor and ALL their leads, interactions, and pipeline history? This cannot be undone.`,
                        )
                      )
                        return;
                      if (
                        !confirm(
                          `Final confirmation: this will remove the investor row entirely and cascade-delete every related record. Continue?`,
                        )
                      )
                        return;
                      const res = await fetch(`/api/v1/admin/investors/${investorId}/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          confirm: true,
                          mode: 'hard',
                          ...(reason.trim() ? { reason: reason.trim() } : {}),
                        }),
                      });
                      if (res.ok) {
                        alert('Investor permanently deleted.');
                        onClose();
                      } else {
                        const j = (await res.json().catch(() => null)) as {
                          title?: string;
                        } | null;
                        alert(`Delete failed: ${j?.title ?? res.status}`);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete permanently
                  </button>
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
