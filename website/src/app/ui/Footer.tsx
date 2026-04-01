import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-left">
          <div className="site-footer-name">SeedMind</div>
          <p className="site-footer-tag">Plant seeds of change. Grow your inner garden.</p>
        </div>
        <div className="site-footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </div>
      </div>
    </footer>
  );
}
