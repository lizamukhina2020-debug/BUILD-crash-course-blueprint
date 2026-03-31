import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer">
      <div className="inner">
        <div className="left">
          <div className="name">SeedMind</div>
          <div className="muted">Plant seeds of change. Grow your inner garden.</div>
        </div>
        <div className="right">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Support</Link>
        </div>
      </div>
      <style>{`
        .footer{border-top:1px solid var(--border);background:rgba(255,255,255,0.45)}
        .inner{max-width:980px;margin:0 auto;padding:18px 24px;display:flex;gap:16px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
        .name{font-weight:800}
        .muted{color:var(--muted);font-size:13px;margin-top:6px;max-width:420px;line-height:1.5}
        .right{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
        .right a:hover{color:var(--text)}
      `}</style>
    </footer>
  );
}

