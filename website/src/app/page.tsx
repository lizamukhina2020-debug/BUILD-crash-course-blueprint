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
                <li>Your mind goes over the same worries again and again.</li>
                <li>You want something in your life to change — but you’re not sure what to do first.</li>
                <li>You want help that feels gentle — not like you’re being scolded.</li>
              </ul>
              <p className="sub">
                <strong>SeedMind</strong> is built for a <strong>real loop</strong>: you bring a goal or a stuck problem,
                the <strong>Seeds Guide</strong> maps <strong>cause → effect</strong> in plain language, you take{' '}
                <strong>actions in the real world</strong>, <strong>record them in your garden</strong>,{' '}
                <strong>water</strong> them with short <strong>meditations</strong> (feel the good you gave — that’s
                what speeds things up), and when life moves, you <strong>harvest</strong> — you log the shift so you
                remember the change was real. Same flow as the app.
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
        <p className="section-kicker">The pieces</p>
        <h2 className="section-title">Three parts — one loop you can feel</h2>
        <div className="grid3">
          <article className="mini">
            <div className="mini-num">01</div>
            <h3 className="mini-title">Seeds Guide</h3>
            <p className="mini-body">
              Say what you want to change. Get empathy, exploration, then the <strong>mirror</strong> and concrete{' '}
              <strong>seed</strong> options — not a giant lecture.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your garden</h3>
            <p className="mini-body">
              <strong>Plant</strong> what you chose and <strong>record</strong> it — so your actions live somewhere you
              can see, not only in your head.
            </p>
          </article>
          <article className="mini">
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
            <p className="section-kicker">Why it’s more than “feeling better for a minute”</p>
            <h2 id="cycle-heading" className="section-title">
              A playful path from goal → action → shift you can name
            </h2>
            <p className="cycle-lead">
              You’re not only here for a pep talk. You’re trying a <strong>different way to move your life</strong> — with
              a map, a garden, and a finish line you can celebrate.
            </p>
            <ul className="cycle-list">
              <li>
                <strong>Start with what you want.</strong> Money, love, belonging, calm — the Guide helps you see{' '}
                <strong>cause and effect</strong> in everyday words: what you give others and what tends to come back.
              </li>
              <li>
                <strong>Do it in the real world.</strong> Pick a seed, act on it, then <strong>log it in your garden</strong>{' '}
                so progress is visible — not lost by next week.
              </li>
              <li>
                <strong>Water with meditation.</strong> Picture what you did, feel how it landed for them — that repetition
                is how SeedMind <strong>speeds up</strong> the same seed you already planted.
              </li>
              <li>
                <strong>Watch reality catch up.</strong> When something actually moves — a door opens, a pattern breaks, a
                relationship softens — that’s not “luck only.” That’s what you’re practicing for.
              </li>
              <li>
                <strong>Harvest.</strong> Record the transformation in the app so you remember: <strong>this changed</strong>
                . That’s the fun part — proof the loop is real.
              </li>
            </ul>
          </div>
          <div className="cycle-visual">
            <p className="hero-visual-label">Harvest — when life moves, log the win</p>
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
