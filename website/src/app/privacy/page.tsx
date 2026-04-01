export default function PrivacyPage() {
  const lastUpdated = '2026-02-20';

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
            <strong>Analytics</strong>: We collect app usage analytics (like screen views and feature usage). We avoid
            sending personal data in analytics events.
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

        <h2>Data retention</h2>
        <p>
          We retain data as long as needed to provide the app. You can request deletion by contacting support (see
          Support page).
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

