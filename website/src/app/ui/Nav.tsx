import Image from 'next/image';
import Link from 'next/link';

import { APP_STORE_URL } from '../store';

export function Nav() {
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <a
          href={APP_STORE_URL}
          className="site-brand"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SeedMind on the App Store"
        >
          <Image
            src="/marketing/logo.png"
            alt=""
            width={36}
            height={36}
            className="site-brand-logo"
            priority
          />
          <span className="site-brand-name">SeedMind</span>
        </a>
        <nav className="site-nav-links" aria-label="Legal and support">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>
      </div>
    </header>
  );
}
