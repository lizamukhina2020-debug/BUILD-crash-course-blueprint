import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Syne } from 'next/font/google';
import './globals.css';
import { Footer } from './ui/Footer';
import { Nav } from './ui/Nav';

const display = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'SeedMind',
  description: 'Plant seeds of change. Grow your inner garden.',
  metadataBase: new URL('https://seedmind.vercel.app'),
};

export const viewport = {
  themeColor: '#08070a',
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

