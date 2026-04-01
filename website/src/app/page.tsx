import Image from 'next/image';
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
                <span>For when your head won’t quiet down</span>
              </div>
              <h1 className="h1">Turn the spiral into one step.</h1>
              <ul className="situation-list" aria-label="You might relate if">
                <li>The same worry loops at night — and you still don’t know what to <em>do</em>.</li>
                <li>You know what would help — but the next step feels too big to start.</li>
                <li>You want change with kindness, not another harsh productivity lecture.</li>
              </ul>
              <p className="sub">
                <strong>SeedMind</strong> is a calm pocket companion: talk it through, get <strong>cause → effect</strong> in
                plain words, plant <strong>one small seed</strong> (a real action), then <strong>water it</strong> with
                short meditations so it actually sticks — closer to how the real app feels than a wall of features.
              </p>
              <div className="cta-row">
                <a className="btn btn-primary" href="#download">
                  Download on iPhone
                </a>
                <Link className="btn btn-ghost" href="/support">
                  Support
                </Link>
                <Link className="btn btn-ghost" href="/privacy">
                  Privacy
                </Link>
              </div>
            </div>

            <div className="hero-visual">
              <p className="hero-visual-label">The real app — same warm tone</p>
              <div className="phone-frame">
                <div className="phone-frame-inner">
                  <Image
                    src="/marketing/app-chat.png"
                    alt="SeedMind: conversation with Seeds Guide on iPhone"
                    width={780}
                    height={1688}
                    className="phone-shot"
                    priority
                    sizes="(max-width: 900px) 72vw, 320px"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="band-relate" aria-labelledby="relate-heading">
        <h2 id="relate-heading" className="band-title">
          Sound familiar?
        </h2>
        <p className="band-lead">You don’t need a lecture. You need <strong>clarity</strong> and <strong>one move</strong> you can repeat.</p>
        <div className="pain-grid">
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🌙
            </span>
            <h3 className="pain-card-title">Mental reruns</h3>
            <p className="pain-card-body">Thinking in circles — without a next step that fits your actual day.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🎯
            </span>
            <h3 className="pain-card-title">Big goals, frozen start</h3>
            <p className="pain-card-body">You care about the outcome — but the first action feels embarrassing or huge.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              💛
            </span>
            <h3 className="pain-card-title">Harsh doesn’t work</h3>
            <p className="pain-card-body">You want growth that feels human — not shame dressed up as motivation.</p>
          </article>
        </div>
      </section>

      <section className="section-example" aria-labelledby="example-heading">
        <div className="example-grid">
          <div className="example-copy">
            <p className="section-kicker">Example — not a script</p>
            <h2 id="example-heading" className="section-title">
              What it can look like in one pass
            </h2>
            <p className="example-intro">
              Names and details are made up — the <strong>shape</strong> is what people use the app for.
            </p>
            <div className="chat-demo" role="figure" aria-label="Example chat flow">
              <div className="chat-line chat-user">
                <span className="chat-label">You</span>
                <p>“I keep putting off a conversation I need to have — and it’s eating my focus.”</p>
              </div>
              <div className="chat-line chat-guide">
                <span className="chat-label">Seeds Guide</span>
                <p>
                  “Let’s name what’s actually stuck: fear of awkwardness, or not knowing the first sentence? Here’s a{' '}
                  <strong>seed</strong> for today: write three honest bullet points — not the message, just what you want
                  them to know. Two minutes.”
                </p>
              </div>
            </div>
            <div className="seed-card">
              <span className="seed-card-tag">Your seed</span>
              <p className="seed-card-text">Write 3 bullet points: what you want them to understand (timer: 2 min).</p>
              <span className="seed-card-meta">Then: optional short meditation to let it land — same rhythm as in-app.</span>
            </div>
          </div>
          <div className="example-visual">
            <p className="hero-visual-label">Garden &amp; growth — in the app</p>
            <div className="phone-frame phone-frame--tilt">
              <div className="phone-frame-inner">
                <Image
                  src="/marketing/app-garden.png"
                  alt="SeedMind garden screen on iPhone"
                  width={780}
                  height={1688}
                  className="phone-shot"
                  sizes="(max-width: 900px) 80vw, 340px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-features">
        <p className="section-kicker">How it fits together</p>
        <h2 className="section-title">Three loops — one gentle system</h2>
        <div className="grid3">
          <article className="mini">
            <div className="mini-num">01</div>
            <h3 className="mini-title">Seeds Guide</h3>
            <p className="mini-body">
              Talk through what’s heavy. Get plain-language clarity and <strong>one</strong> concrete seed — not a todo
              avalanche.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your garden</h3>
            <p className="mini-body">
              Plant what you chose. Come back without judgment — consistency matters more than perfection.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">03</div>
            <h3 className="mini-title">Meditations</h3>
            <p className="mini-body">
              Short sessions to <strong>water</strong> what you planted — so the step feels real in your body, not only
              in your notes.
            </p>
          </article>
        </div>
      </section>

      <section className="section-outcomes" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading" className="outcomes-title">
          What people often want after a week of honest use
        </h2>
        <ul className="outcomes-list">
          <li>
            <strong>Less rumble, more language</strong> — you can name the pattern instead of drowning in it.
          </li>
          <li>
            <strong>A repeatable micro-step</strong> — small enough for a tired Tuesday, not only a motivated Sunday.
          </li>
          <li>
            <strong>A kind place to return</strong> — the app’s job is to help you show up again, not to shame you for
            slipping.
          </li>
        </ul>
      </section>

      <section id="download" className="section-download">
        <div className="download-card">
          <h2 className="download-heading">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get SeedMind on the App Store
            </a>
          </h2>
          <p>
            Built for iPhone. Open the{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              App Store listing
            </a>
            , install in a few taps, and try <strong>one honest conversation</strong> — see if you walk away with a
            single next step that feels doable.
          </p>
        </div>
      </section>
    </div>
  );
}
