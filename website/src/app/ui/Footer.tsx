import Image from 'next/image';
import Link from 'next/link';

import { APP_STORE_URL } from '../store';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <a
          href={APP_STORE_URL}
          className="site-footer-brand"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SeedMind on the App Store"
        >
          <Image
            src="/marketing/logo.png"
            alt=""
            width={44}
            height={44}
            className="site-footer-logo"
          />
          <div>
            <div className="site-footer-name">SeedMind</div>
            <p className="site-footer-tag">Plant seeds of change. Grow your inner garden.</p>
          </div>
        </a>
        <div className="site-footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </div>
      </div>
    </footer>
  );
}
