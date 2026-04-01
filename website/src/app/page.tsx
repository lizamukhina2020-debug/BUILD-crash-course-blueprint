import Link from 'next/link';

const APP_STORE_URL = 'https://apps.apple.com/app/id6759827726';

export default function HomePage() {
  return (
    <div className="landing">
      <div className="hero-shell">
        <div className="hero-orbs" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="badge">
                <span aria-hidden>🌱</span>
                <span>SeedMind — companion for growth</span>
              </div>
              <h1 className="h1">Plant seeds of change.</h1>
              <p className="sub">
                Turn clarity into momentum: chat with your Seeds Guide, plant seeds in your garden, and water them
                through meditation — so small steps actually stick.
              </p>
              <div className="cta-row">
                <a className="btn btn-primary" href="#download">
                  Get started
                </a>
                <Link className="btn btn-ghost" href="/support">
                  Support
                </Link>
                <Link className="btn btn-ghost" href="/privacy">
                  Privacy
                </Link>
              </div>
            </div>

            <div className="preview" aria-label="App preview">
              <div className="preview-glow" aria-hidden />
              <div className="preview-title">A calm, focused flow</div>
              <div className="preview-bubble">
                “Tell me what’s on your mind — we’ll plant one small seed you can do today.”
              </div>
              <div className="preview-meta">
                <div className="pill">Chat → Seeds</div>
                <div className="pill">Garden</div>
                <div className="pill">Meditation</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="section-features">
        <p className="section-kicker">Inside the app</p>
        <h2 className="section-title">Three threads, one rhythm</h2>
        <div className="grid3">
          <article className="mini">
            <div className="mini-num">01</div>
            <h3 className="mini-title">Seeds Guide</h3>
            <p className="mini-body">
              A gentle chat that helps you reflect, choose a seed action, and keep moving.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your Garden</h3>
            <p className="mini-body">
              Plant seeds from your journeys and watch them grow with consistent care.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">03</div>
            <h3 className="mini-title">Meditations</h3>
            <p className="mini-body">
              Water your seeds, build a streak, and reinforce the person you’re becoming.
            </p>
          </article>
        </div>
      </section>

      <section id="download" className="section-download">
        <div className="download-card">
          <h2 className="download-heading">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Download SeedMind
            </a>
          </h2>
          <p>
            Available on the{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              App Store for iPhone
            </a>
            . Tap through to the product page and install in a few taps.
          </p>
        </div>
      </section>
    </div>
  );
}
