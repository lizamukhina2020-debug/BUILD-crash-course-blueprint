import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';
import { Footer } from './ui/Footer';
import { Nav } from './ui/Nav';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'SeedMind',
  description:
    'Calm companion for clarity and small steps: chat, seeds, garden, and meditation — built for real stuck moments.',
  metadataBase: new URL('https://seedmind.vercel.app'),
};

export const viewport = {
  themeColor: '#faf7f2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <div className="app">
          <div className="bg-layers" aria-hidden />
          <Nav />
          <main className="main">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
