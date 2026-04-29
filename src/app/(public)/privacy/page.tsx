import Link from 'next/link';

export const metadata = { title: 'Privacy — OotaOS' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-16">
      <Link href="/" className="text-sm font-medium text-violet-700 hover:text-violet-900">
        ← Back to OotaOS
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Privacy</h1>
      <p className="mt-2 text-sm text-slate-500">Effective 1 February 2026</p>
      <div className="prose prose-slate mt-6 max-w-none text-[15px] leading-relaxed text-slate-700">
        <p>
          OotaOS is operated by the founding team of OotaOS Technologies based in Bangalore,
          Karnataka. This page explains what we collect, why, and how long we keep it.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>The email you give us when you sign the NDA, plus the signature artifact.</li>
          <li>Questions you ask our AI concierge (stored so we can improve retrieval quality).</li>
          <li>Basic access logs — IP, user agent, timestamps — to keep the service safe.</li>
        </ul>
        <h2>What we do not do</h2>
        <ul>
          <li>We never sell your email or your questions.</li>
          <li>We never use your questions to train foundation models.</li>
          <li>We never share your identity with third parties outside the founding team.</li>
        </ul>
        <h2>Retention</h2>
        <p>
          NDA records are retained for the duration of the fundraise plus 7 years. Concierge
          conversations are retained for 30 days and then deleted or anonymized.
        </p>
        <h2>Your rights</h2>
        <p>
          Email <a href="mailto:info@ootaos.com">info@ootaos.com</a> to request deletion of your
          records. We respond within 7 days.
        </p>
      </div>
    </main>
  );
}
