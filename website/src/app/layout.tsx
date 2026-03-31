import type { Metadata } from 'next';
import './globals.css';
import { Footer } from './ui/Footer';
import { Nav } from './ui/Nav';

export const metadata: Metadata = {
  title: 'SeedMind',
  description: 'Plant seeds of change. Grow your inner garden.',
  metadataBase: new URL('https://seedmind.vercel.app'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Nav />
          <main className="main">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

