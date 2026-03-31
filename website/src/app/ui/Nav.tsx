import Link from 'next/link';

export function Nav() {
  return (
    <header className="nav">
      <div className="navInner">
        <Link href="/" className="brand">
          <span className="brandDot" />
          <span className="brandName">SeedMind</span>
        </Link>
        <nav className="links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </nav>
      </div>
      <style>{`
        .nav{position:sticky;top:0;z-index:10;background:rgba(250,247,242,0.78);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
        .navInner{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 24px}
        .brand{display:flex;align-items:center;gap:10px}
        .brandDot{width:10px;height:10px;border-radius:999px;background:var(--accent)}
        .brandName{font-weight:800;letter-spacing:-0.2px}
        .links{display:flex;gap:14px;color:var(--muted);font-size:14px}
        .links a:hover{color:var(--text)}
      `}</style>
    </header>
  );
}

