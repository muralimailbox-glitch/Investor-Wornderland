import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OotaOS — Investor Wonderland',
  description:
    'Where investors don\u2019t read pitches. They have conversations. An AI-native investor experience platform.',
  metadataBase: new URL('https://www.ootaos.com'),
  openGraph: {
    title: 'OotaOS — Investor Wonderland',
    description: 'An AI-native investor experience platform.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
