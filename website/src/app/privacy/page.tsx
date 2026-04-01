export default function PrivacyPage() {
  const lastUpdated = '2026-03-31';

  return (
    <>
      <h1 className="page-title">Privacy Policy</h1>
      <section className="card legal">
        <p>
          <strong>Last updated:</strong> {lastUpdated}
        </p>
        <p>
          SeedMind (“we”, “us”) respects your privacy. This policy explains what we collect, why we collect it, and how
          you can contact us.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info</strong>: If you sign in, we use your authentication provider (Apple, Google, or email)
            to identify your account.
          </li>
          <li>
            <strong>App data you create</strong>: Your journeys/chats, garden progress, and settings may be stored on
            your device and (if you enable cloud sync) in our database tied to your user ID.
          </li>
          <li>
            <strong>Analytics</strong>: We collect product analytics (for example screen views and feature usage). We do
            not put message content, email, or similar details into analytics <strong>event parameters</strong>. When you
            are signed in, our analytics provider may associate events with a <strong>pseudonymous app account ID</strong>{' '}
            (your Firebase user id) — not your name or chat text.
          </li>
        </ul>

        <h2>How we use data</h2>
        <ul>
          <li>To provide core features (sign-in, syncing across devices, progress tracking).</li>
          <li>To improve reliability and product quality (crash and performance diagnostics).</li>
          <li>To understand feature usage (aggregate analytics).</li>
        </ul>

        <h2>Sharing</h2>
        <p>
          We do not sell your personal information. We use service providers (like Firebase) to operate the app. These
          providers process data on our behalf under their terms.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          We retain data as long as needed to provide the app. On the <strong>iPhone app</strong>, you can delete your
          account and cloud data from <strong>Settings</strong> (delete account). That removes your SeedMind cloud data
          tied to your account and deletes your sign-in profile, subject to your provider&apos;s normal auth flows. If
          delete isn&apos;t available on your platform or something fails, contact us via the Support page and we&apos;ll
          help.
        </p>

        <h2>Security</h2>
        <p>
          We use authentication and access controls to protect your data. No method of transmission or storage is 100%
          secure, but we continuously work to improve safeguards.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions, see the Support page for the latest contact method.
        </p>
      </section>
    </>
  );
}

