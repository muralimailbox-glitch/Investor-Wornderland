import Link from 'next/link';

export const metadata = { title: 'Terms — OotaOS' };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-16">
      <Link href="/" className="text-sm font-medium text-violet-700 hover:text-violet-900">
        ← Back to OotaOS
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Terms of use</h1>
      <p className="mt-2 text-sm text-slate-500">Effective 1 February 2026</p>
      <div className="prose prose-slate mt-6 max-w-none text-[15px] leading-relaxed text-slate-700">
        <p>
          By using OotaOS you agree to these terms. They are short on purpose — if something is
          unclear, email <a href="mailto:info@ootaos.com">info@ootaos.com</a> and we will answer the
          same day.
        </p>
        <h2>Who can use OotaOS</h2>
        <p>
          OotaOS is intended for accredited investors evaluating the OotaOS seed round and for
          founders using the platform to manage their own investor relationships. Do not use OotaOS
          to scrape, automate, or resell the content.
        </p>
        <h2>Accuracy of AI answers</h2>
        <p>
          Olivia, our AI concierge, answers only from the founders&apos; own writing. We make every
          effort to keep answers accurate. Final terms, numbers, and commitments are the written
          word of the founders in email — never the AI&apos;s paraphrase.
        </p>
        <h2>Confidentiality</h2>
        <p>
          Content behind the NDA is strictly confidential. Downloaded materials are watermarked with
          your email. Re-distribution is a breach of the NDA you signed.
        </p>
        <h2>Changes</h2>
        <p>
          We may update these terms. If we make a material change we will email every signed
          investor with 14 days of notice.
        </p>
      </div>
    </main>
  );
}
