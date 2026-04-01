import Link from 'next/link';

export function Nav() {
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand">
          <span className="site-brand-dot" aria-hidden />
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
