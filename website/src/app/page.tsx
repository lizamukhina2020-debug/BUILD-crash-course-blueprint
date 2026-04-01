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
                <strong>SeedMind</strong> is a calm space on your phone: you <strong>talk with your Seeds Guide</strong>, get
                plain words for what might be going on, pick <strong>one small seed</strong> (a real action), and use{' '}
                <strong>short meditations</strong> to help it stick — the same flow as in the app.
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
            <p className="section-kicker">Example</p>
            <h2 id="example-heading" className="section-title">
              The kind of answer your Seeds Guide might give
            </h2>
            <p className="example-intro">
              This is <strong>made up</strong> — but it’s close to how the app talks: simple cause-and-effect, then seeds you
              can pick from.
            </p>
            <div className="chat-demo" role="figure" aria-label="Example chat flow">
              <div className="chat-line chat-user">
                <span className="chat-label">You</span>
                <p>“I don’t want to feel so lonely. I want to feel like I belong.”</p>
              </div>
              <div className="chat-line chat-guide">
                <span className="chat-label">Seeds Guide</span>
                <p>
                  “This kind of feeling can be connected to moments when someone felt they didn’t belong — including
                  times you might have left someone on the outside without meaning to. It can also be tied to when{' '}
                  <em>you</em> felt unseen. Naming that doesn’t fix everything overnight, but it can make the loneliness
                  feel a little less random. From here we can look at <strong>small seeds</strong> — real actions — you
                  can choose from.”
                </p>
              </div>
            </div>
            <div className="seed-card">
              <span className="seed-card-tag">Seeds you could plant</span>
              <p className="seed-card-pick">
                In the app you’ll get <strong>several</strong> ideas like these. <strong>Pick one</strong> to start — any
                one is enough. You can explore others when you’re ready.
              </p>
              <ul className="seed-options">
                <li>Text someone you’ve been meaning to check in on.</li>
                <li>Say hi to someone who often sits alone.</li>
                <li>Do one small kind thing for a neighbor or coworker.</li>
              </ul>
              <span className="seed-card-meta">After you plant a seed, you can water it with a short meditation in the app.</span>
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
        <p className="section-kicker">How it fits together</p>
        <h2 className="section-title">Three simple pieces</h2>
        <div className="grid3">
          <article className="mini">
            <div className="mini-num">01</div>
            <h3 className="mini-title">Seeds Guide</h3>
            <p className="mini-body">
              Say what’s on your mind. Get clear language back — and a few <strong>seed</strong> ideas, not a giant to-do
              list.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">02</div>
            <h3 className="mini-title">Your garden</h3>
            <p className="mini-body">
              Plant the seed you chose. Come back when you can — small visits count more than perfect streaks.
            </p>
          </article>
          <article className="mini">
            <div className="mini-num">03</div>
            <h3 className="mini-title">Meditations</h3>
            <p className="mini-body">
              Short sessions to <strong>water</strong> what you planted — so it sinks in, not just live in your head.
            </p>
          </article>
        </div>
      </section>

      <section className="section-outcomes" aria-labelledby="outcomes-heading">
        <h2 id="outcomes-heading" className="outcomes-title">
          What many people are hoping for after sticking with it a little
        </h2>
        <ul className="outcomes-list">
          <li>
            <strong>Words for what’s going on</strong> — so it’s not just noise in your head.
          </li>
          <li>
            <strong>One step you can repeat</strong> — small enough for a normal tired day.
          </li>
          <li>
            <strong>A place to return to</strong> — without shame when you drift off and come back.
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
            , install, and try <strong>one conversation</strong> with your Seeds Guide — see if you leave with one next
            step that feels okay to try.
          </p>
        </div>
      </section>
    </div>
  );
}
