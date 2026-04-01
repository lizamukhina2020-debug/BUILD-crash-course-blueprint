import Image from 'next/image';
import Link from 'next/link';

export function Nav() {
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand" aria-label="SeedMind — home">
          <Image
            src="/marketing/logo.png"
            alt=""
            width={36}
            height={36}
            className="site-brand-logo"
            priority
          />
          <span className="site-brand-name">SeedMind</span>
        </Link>
        <nav className="site-nav-links" aria-label="Legal and support">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>
      </div>
    </header>
  );
}
