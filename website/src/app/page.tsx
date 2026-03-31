import Link from 'next/link';

const APP_STORE_URL = 'https://apps.apple.com/app/id6759827726';

export default function HomePage() {
  return (
    <>
      <section className="card hero">
        <div className="heroGrid">
          <div>
            <div className="badge">
              <span>🌱</span>
              <span>SeedMind — your companion for growth</span>
            </div>
            <h1 className="h1">Plant seeds of change.</h1>
            <p className="sub">
              SeedMind helps you turn kindness into momentum: chat with your Seeds Guide, plant seeds in your garden,
              and water them through meditation.
            </p>
            <div className="ctaRow">
              <a className="btn btnPrimary" href="#download">
                Get started
              </a>
              <Link className="btn btnGhost" href="/support">
                Support
              </Link>
              <Link className="btn btnGhost" href="/build">
                BUILD guide
              </Link>
              <Link className="btn" href="/privacy">
                Privacy
              </Link>
            </div>
          </div>

          <div className="preview" aria-label="App preview">
            <div className="previewTitle">A cozy, simple flow</div>
            <div className="previewBubble">
              “Tell me what’s on your mind — we’ll plant one small seed you can do today.”
            </div>
            <div className="previewMeta">
              <div className="pill">Chat → Seeds</div>
              <div className="pill">Garden growth</div>
              <div className="pill">Meditation streak</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="grid3">
          <div className="card mini">
            <h3 className="miniTitle">Seeds Guide</h3>
            <p className="miniBody">
              A gentle chat that helps you reflect, choose a seed action, and keep moving.
            </p>
          </div>
          <div className="card mini">
            <h3 className="miniTitle">Your Garden</h3>
            <p className="miniBody">
              Plant seeds from your journeys and watch them grow with consistent care.
            </p>
          </div>
          <div className="card mini">
            <h3 className="miniTitle">Meditations</h3>
            <p className="miniBody">
              Water your seeds, build a streak, and reinforce the person you’re becoming.
            </p>
          </div>
        </div>
      </section>

      <section id="download" className="section card legal">
        <h2 className="downloadHeading">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            Download SeedMind
          </a>
        </h2>
        <p>
          SeedMind is available on the{' '}
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            App Store for iPhone
          </a>
          . Tap the link above to open the product page and install the app.
        </p>
      </section>
    </>
  );
}

