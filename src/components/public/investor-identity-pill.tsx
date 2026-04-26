import { UserCircle2 } from 'lucide-react';

type Props = {
  firstName: string | null;
  lastName?: string | null;
  firmName: string | null;
};

/**
 * Always-visible identity strip on every cookie-validated investor page.
 * Renders "Hi {firstName} — {firmName}" so the investor sees we recognize
 * them on every screen they touch (lounge, ask, doc preview, etc).
 *
 * If we have neither a name nor a firm, renders nothing.
 */
export function InvestorIdentityPill({ firstName, lastName, firmName }: Props) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (!name && !firmName) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/85 px-3 py-1.5 text-xs font-medium text-orange-900 shadow-sm backdrop-blur">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-500 text-white">
        <UserCircle2 className="h-3.5 w-3.5" />
      </span>
      {name ? (
        <span>
          Hi <span className="font-semibold">{firstName}</span>
          {firmName ? (
            <>
              {' '}— <span className="text-slate-600">{firmName}</span>
            </>
          ) : null}
        </span>
      ) : firmName ? (
        <span className="text-slate-700">{firmName}</span>
      ) : null}
    </div>
  );
}
