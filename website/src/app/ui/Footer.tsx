import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="site-footer-brand" aria-label="SeedMind — home">
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
        </Link>
        <div className="site-footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </div>
      </div>
    </footer>
  );
}
