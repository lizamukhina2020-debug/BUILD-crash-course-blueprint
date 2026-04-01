import Image from 'next/image';
import Link from 'next/link';

import { APP_STORE_URL } from './store';

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
              <p className="hero-line">
                When your mind won’t quit, <strong>SeedMind</strong> gives you the same rhythm as the app:{' '}
                <strong>clarity</strong> → <strong>one real seed</strong> → <strong>your garden</strong> →{' '}
                <strong>water</strong> → <strong>harvest</strong> when life actually moves — kind, concrete, pocket-sized.
              </p>
              <div className="cta-row">
                <a
                  className="btn btn-primary"
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
        <h2 id="relate-heading" className="band-title">
          Sound familiar?
        </h2>
        <p className="band-lead">
          You don’t need a lecture. You need something <strong>clear</strong> and <strong>one small thing</strong> you can
          actually try.
        </p>
        <div className="pain-grid">
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🌙
            </span>
            <h3 className="pain-card-title">Can’t switch off</h3>
            <p className="pain-card-body">You lie down and your brain keeps running — same thoughts, no off switch.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              🎯
            </span>
            <h3 className="pain-card-title">Stuck at the start</h3>
            <p className="pain-card-body">You care about changing something — but every idea feels too big or too vague.</p>
          </article>
          <article className="pain-card">
            <span className="pain-icon" aria-hidden>
              💛
            </span>
            <h3 className="pain-card-title">Harsh doesn’t work</h3>
            <p className="pain-card-body">You’ve tried pushing yourself hard. It didn’t last. You want something kinder.</p>
          </article>
        </div>
      </section>

      <section className="section-example" aria-labelledby="example-heading">
        <div className="example-grid">
          <div className="example-copy">
            <p className="section-kicker">Inside a real turn</p>
            <h2 id="example-heading" className="section-title">
              How the Seeds Guide sounds in SeedMind
            </h2>
            <p className="example-intro">
              After you share what’s going on, the Guide explores with you — then names the <strong>mirror</strong>: how
              something you did toward others may line up with what you feel now. Then you choose <strong>seeds</strong>{' '}
              (real actions). Below is that <strong>mirror moment</strong>, shortened for the page — the same structure
              the app uses.
            </p>
            <div className="chat-demo" role="figure" aria-label="Example Seeds Guide mirror moment">
              <div className="chat-line chat-user">
                <span className="chat-label">You</span>
                <p>“I don’t want to feel so lonely. I want to feel like I belong.”</p>
              </div>
              <div className="chat-line chat-guide">
                <span className="chat-label">Seeds Guide</span>
                <p>
                  Do you see what might be connected? Think back — was there a time someone wanted to feel included, and
                  maybe you didn’t make room: you didn’t answer, didn’t invite them in, or looked away when they tried to
                  join? They may have felt <strong>left out</strong> — like they didn’t belong.
                </p>
                <p>
                  What you’re craving now — <strong>belonging</strong> — can be that same kind of feeling coming back
                  around. <strong>Life works like a mirror.</strong> The feeling you gave can be the feeling you receive.
                </p>
                <p>
                  That’s not here to shame you; it’s the opposite — it means you can <strong>plant something new</strong>.
                  Let’s pick a small action that gives someone else the warmth you want to feel.
                </p>
              </div>
            </div>
            <div className="seed-card">
              <span className="seed-card-tag">Seeds you could plant</span>
              <p className="seed-card-pick">
                In the app you’ll see <strong>several</strong> ideas like these. <strong>Pick one</strong> to start — any
                one is enough. You can explore others when you’re ready.
              </p>
              <ul className="seed-options">
                <li>Reach out to someone you’ve lost touch with.</li>
                <li>Include someone who looks alone.</li>
                <li>Really listen to someone today — full presence, no phone.</li>
              </ul>
              <span className="seed-card-meta">
                Then you <strong>water</strong> what you planted with a short meditation in the app — picture their face,
                feel the good you gave — that’s what helps the seed ripen faster.
              </span>
            </div>
          </div>
          <div className="example-visual">
            <p className="hero-visual-label">Your garden — where your seeds grow</p>
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
          </div>
        </div>
      </section>

      <section className="section-features">
        <p className="section-kicker section-kicker--spark">The pieces</p>
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
              Say what you want to change. Get empathy, exploration, then the <strong>mirror</strong> and concrete{' '}
              <strong>seed</strong> options — not a giant lecture.
            </p>
          </article>
          <article className="mini mini--garden">
            <span className="mini-emoji" aria-hidden>
              🌿
            </span>
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your garden</h3>
            <p className="mini-body">
              <strong>Plant</strong> what you chose and <strong>record</strong> it — so your actions live somewhere you
              can see, not only in your head.
            </p>
          </article>
          <article className="mini mini--water">
            <span className="mini-emoji" aria-hidden>
              ☕
            </span>
            <div className="mini-num">03</div>
            <h3 className="mini-title">Meditations</h3>
            <p className="mini-body">
              <strong>Water</strong> your seeds: short sessions where you feel the other person’s relief or joy — the app’s
              way to help good results show up <strong>sooner</strong>.
            </p>
          </article>
        </div>
      </section>

      <section className="section-cycle" aria-labelledby="cycle-heading">
        <div className="cycle-grid">
          <div className="cycle-copy">
            <p className="section-kicker">The finish line</p>
            <h2 id="cycle-heading" className="section-title">
              Harvest — when life moves, log the win
            </h2>
            <div className="harvest-prose">
              <p>
                The whole point isn’t only to feel clearer for an hour. It’s to <strong>shift what shows up</strong> — and
                to know <strong>you had something to do with it</strong>.
              </p>
              <p>
                When something in your world finally moves — a conversation opens, a pattern breaks, an opportunity
                appears — <strong>harvest</strong> is where you <strong>record that transformation</strong>. It’s your
                proof: the fruit of seeds you planted and watered. You’re not guessing whether the loop works — you’re
                looking at a moment you can name.
              </p>
              <p className="harvest-spark">
                That’s the exciting part: <strong>trying goals in a new way</strong> — kind, concrete, and a little like
                tending something alive.
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
        <h2 id="outcomes-heading" className="outcomes-title">
          What you’re really reaching for when you stick with it
        </h2>
        <ul className="outcomes-list">
          <li>
            <strong>Problems that start to look fixable</strong> — not because someone yelled at you, but because you see
            a line between what you do for others and what shows up for you.
          </li>
          <li>
            <strong>Goals that meet the ground</strong> — tiny actions you repeat, track in the garden, and water — so
            “change” isn’t only a mood, it’s something you did.
          </li>
          <li>
            <strong>A reality that can shift</strong> — then a <strong>harvest</strong> you record, so you don’t forget
            the moment things moved. That’s the point: try a new angle, stay kind, and let the app hold the thread.
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
            For iPhone. Open the{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              App Store listing
            </a>
            , install, and start <strong>one conversation</strong> — plant a seed, peek at your garden, try one water
            session. See if you want to run the full loop.
          </p>
        </div>
      </section>
    </div>
  );
}
