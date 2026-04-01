import Image from 'next/image';
import Link from 'next/link';

import { APP_STORE_URL } from './store';

/** Fresh HTML on every request so production matches your latest deploy (not a stale CDN copy). */
export const revalidate = 0;

export default function HomePage() {
  return (
    <div className="landing">
      <div className="hero-shell">
        <div className="hero-orbs" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="badge">
                <span aria-hidden>🌱</span>
                <span>For when your head won’t quiet down</span>
              </div>
              <h1 className="h1" id="hero-heading">
                Turn the spiral into one step.
              </h1>
              <p className="hero-step-label">
                <span className="hero-step-num">1</span> The problem we solve
              </p>
              <ul className="situation-list situation-list--hero">
                <li>
                  <em>Stuck</em> on something real — money, belonging, stress, love, or a loop you can’t name.
                </li>
                <li>
                  You’ve tried other fixes; <em>nothing really sticks</em>.
                </li>
                <li>
                  You want <em>one path you can see and repeat</em> — not another night in your head.
                </li>
              </ul>
              <p className="hero-step-label hero-step-label--inline">
                <span className="hero-step-num">2</span> What SeedMind does
              </p>
              <p className="hero-rhythm-label">One loop, end to end</p>
              <div className="hero-rhythm" aria-label="SeedMind flow: clarity through harvest">
                <div className="hero-rhythm-track">
                  <span className="hero-rhythm-pill">Clarity</span>
                  <span className="hero-rhythm-arrow" aria-hidden>
                    →
                  </span>
                  <span className="hero-rhythm-pill">One seed</span>
                  <span className="hero-rhythm-arrow" aria-hidden>
                    →
                  </span>
                  <span className="hero-rhythm-pill">Garden</span>
                </div>
                <span className="hero-rhythm-between" aria-hidden>
                  <span className="hero-rhythm-between-icon">→</span>
                </span>
                <div className="hero-rhythm-track">
                  <span className="hero-rhythm-pill">Water</span>
                  <span className="hero-rhythm-arrow" aria-hidden>
                    →
                  </span>
                  <span className="hero-rhythm-pill">Harvest</span>
                </div>
              </div>
              <p className="hero-rhythm-note">Kind, concrete, built to repeat.</p>
              <div className="cta-row cta-row--hero">
                <a
                  className="btn btn-primary"
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="btn-label-hero-full">Download on iPhone</span>
                  <span className="btn-label-hero-short">Download</span>
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
              <p className="hero-visual-label">Talk to your Seeds Guide</p>
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
        <p className="section-flow-kicker">
          <span className="hero-step-num">3</span> Does this sound like you?
        </p>
        <h2 id="relate-heading" className="band-title">
          Sound familiar?
        </h2>
        <p className="band-lead">
          Below: a <strong>real example</strong>, then the <strong>three pieces</strong> that run the loop.
        </p>
        <div className="pain-grid">
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🌙
            </span>
            <h3 className="pain-card-title">Can’t switch off</h3>
            <p className="pain-card-body">You lie down; the same thoughts keep running.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🎯
            </span>
            <h3 className="pain-card-title">Stuck at the start</h3>
            <p className="pain-card-body">You care — but every next step feels too big or fuzzy.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              💛
            </span>
            <h3 className="pain-card-title">Harsh doesn’t work</h3>
            <p className="pain-card-body">Hard push didn’t last. You want something that actually fits.</p>
          </article>
        </div>
      </section>

      <section className="section-example" aria-labelledby="example-heading">
        <div className="example-header">
          <p className="section-flow-kicker section-flow-kicker--soft">
            <span className="hero-step-num">4</span> Inside the app
          </p>
          <h2 id="example-heading" className="section-title section-title--tight">
            From stuck → to one small action
          </h2>
          <p className="example-lead">The Guide maps your situation in three beats — then you pick a seed.</p>
          <div className="example-flow" role="list">
            <div className="example-flow-card" role="listitem">
              <span className="example-flow-num">1</span>
              <div>
                <h3 className="example-flow-title">Cause &amp; effect</h3>
                <p className="example-flow-body">Plain language, not a lecture.</p>
              </div>
            </div>
            <div className="example-flow-card" role="listitem">
              <span className="example-flow-num">2</span>
              <div>
                <h3 className="example-flow-title">Mirror</h3>
                <p className="example-flow-body">How what you gave and what you want might connect.</p>
              </div>
            </div>
            <div className="example-flow-card" role="listitem">
              <span className="example-flow-num">3</span>
              <div>
                <h3 className="example-flow-title">Pick a seed</h3>
                <p className="example-flow-body">Tiny actions you choose from — always your call.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="example-body">
          <div className="example-main">
            <details className="chat-disclosure">
              <summary className="chat-disclosure-summary">
                <span className="chat-disclosure-title">Hear the Guide (short sample)</span>
                <span className="chat-disclosure-hint">Tap to expand</span>
              </summary>
              <div className="chat-demo" role="figure" aria-label="Example Seeds Guide mirror moment">
                <div className="chat-line chat-user">
                  <span className="chat-label">You</span>
                  <p>“I don’t want to feel so lonely. I want to feel like I belong.”</p>
                </div>
                <div className="chat-line chat-guide">
                  <span className="chat-label">Seeds Guide</span>
                  <p>
                    Was there a time someone wanted in, and you held back? They may have felt <strong>left out</strong>.
                  </p>
                  <p>
                    What you want — <strong>belonging</strong> — can circle back. <strong>Life mirrors.</strong> So you can{' '}
                    <strong>plant something new</strong>: one small warmth for someone else.
                  </p>
                </div>
              </div>
            </details>
            <div className="seed-card">
              <span className="seed-card-tag">Seeds you could plant</span>
              <p className="seed-card-pick">
                <strong>Pick one.</strong> The app suggests more when you’re ready.
              </p>
              <ul className="seed-options seed-options--compact">
                <li>Text someone you’ve drifted from</li>
                <li>Include someone who looks alone</li>
                <li>Listen with full presence — phone away</li>
              </ul>
              <span className="seed-card-meta">
                <strong>Water</strong> in-app: a short meditation where you visualize their happiness from what you did,
                widen that wish to others and toward your own goal — a catalyst that helps growth show up sooner.
              </span>
            </div>
          </div>
          <aside className="example-side">
            <p className="hero-visual-label">Your garden</p>
            <div className="phone-frame phone-frame--tilt">
              <div className="phone-frame-inner">
                <Image
                  src="/marketing/app-garden.png"
                  alt="SeedMind garden on iPhone"
                  width={780}
                  height={1688}
                  className="phone-shot"
                  sizes="(max-width: 900px) 80vw, 340px"
                />
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="section-features">
        <p className="section-flow-kicker section-flow-kicker--spark">
          <span className="hero-step-num">5</span> The pieces
        </p>
        <h2 className="section-title">
          <span className="title-emoji" aria-hidden>
            ✨
          </span>{' '}
          Three parts — one loop you can feel
        </h2>
        <div className="grid3">
          <article className="mini mini--guide">
            <span className="mini-emoji" aria-hidden>
              💬
            </span>
            <div className="mini-num">01</div>
            <h3 className="mini-title">Seeds Guide</h3>
            <p className="mini-body">
              Say what’s stuck. Get empathy, then the <strong>mirror</strong> and <strong>seed</strong> options — not a
              lecture.
            </p>
          </article>
          <article className="mini mini--garden">
            <span className="mini-emoji" aria-hidden>
              🌿
            </span>
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your garden</h3>
            <p className="mini-body">
              <strong>Plant</strong> and <strong>log</strong> it — so it’s visible, not only in your head.
            </p>
          </article>
          <article className="mini mini--water">
            <span className="mini-emoji" aria-hidden>
              ☕
            </span>
            <div className="mini-num">03</div>
            <h3 className="mini-title">Meditations</h3>
            <p className="mini-body">
              <strong>Water</strong> with short sessions — feel their relief or joy — so results can land{' '}
              <strong>sooner</strong>.
            </p>
          </article>
        </div>
      </section>

      <section className="section-cycle" aria-labelledby="cycle-heading">
        <div className="cycle-grid">
          <div className="cycle-copy">
            <p className="section-flow-kicker section-flow-kicker--soft">
              <span className="hero-step-num">6</span> The finish line
            </p>
            <h2 id="cycle-heading" className="section-title">
              Harvest — when life moves, log the win
            </h2>
            <div className="harvest-prose">
              <p>
                When something <strong>actually moves</strong> — talk opens, a pattern breaks, a door appears —{' '}
                <strong>harvest</strong> is where you <strong>log it</strong>. Proof the loop did something you can name.
              </p>
              <p className="harvest-spark">
                Kind, concrete, a little like tending something <strong>alive</strong> — not a one-hour high.
              </p>
            </div>
          </div>
          <div className="cycle-visual">
            <p className="hero-visual-label">Harvest in the app</p>
            <div className="phone-frame phone-frame--tilt-rev">
              <div className="phone-frame-inner">
                <Image
                  src="/marketing/app-harvest.png"
                  alt="SeedMind harvest screen on iPhone"
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

      <section className="section-outcomes" aria-labelledby="outcomes-heading">
        <p className="section-flow-kicker section-flow-kicker--outcomes">
          <span className="hero-step-num">7</span> What you’re building toward
        </p>
        <h2 id="outcomes-heading" className="outcomes-title">
          <span className="title-emoji title-emoji--lg" aria-hidden>
            🌟
          </span>{' '}
          When you stick with the loop
        </h2>
        <p className="outcomes-lead">
          Not magic overnight — <strong>progress you can point to</strong>.
        </p>
        <div className="outcomes-grid">
          <article className="outcome-card outcome-card--fix">
            <span className="outcome-emoji" aria-hidden>
              🧭
            </span>
            <h3 className="outcome-card-title">Problems feel workable</h3>
            <p className="outcome-card-body">
              A clearer line between what you <strong>give</strong> and what <strong>comes back</strong> — without toxic
              positivity.
            </p>
          </article>
          <article className="outcome-card outcome-card--goals">
            <span className="outcome-emoji" aria-hidden>
              🎯
            </span>
            <h3 className="outcome-card-title">Goals hit the ground</h3>
            <p className="outcome-card-body">
              Small moves you <strong>repeat</strong>, log, and water — change as <strong>action</strong>, not only mood.
            </p>
          </article>
          <article className="outcome-card outcome-card--shift">
            <span className="outcome-emoji" aria-hidden>
              ✨
            </span>
            <h3 className="outcome-card-title">Shifts you can name</h3>
            <p className="outcome-card-body">
              When life shifts, you <strong>harvest</strong> — a win you won’t forget you earned.
            </p>
          </article>
        </div>
      </section>

      <section id="download" className="section-download">
        <div className="download-card">
          <h2 className="download-heading">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get SeedMind on the App Store
            </a>
          </h2>
          <p>
            iPhone only. Install from the{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              App Store
            </a>
            , open <strong>one Guide chat</strong>, plant a seed, try one water — then decide if you want the full loop.
          </p>
        </div>
      </section>
    </div>
  );
}
