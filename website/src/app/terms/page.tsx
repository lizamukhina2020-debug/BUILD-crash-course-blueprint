export default function TermsPage() {
  const lastUpdated = '2026-02-20';

  return (
    <>
      <h1 className="page-title">Terms of Service</h1>
      <section className="card legal">
        <p>
          <strong>Last updated:</strong> {lastUpdated}
        </p>
        <p>
          By using SeedMind, you agree to these Terms. If you do not agree, do not use the app.
        </p>

        <h2>SeedMind is not medical care</h2>
        <p>
          SeedMind provides self-help and wellness tools. It does not provide medical advice, diagnosis, or treatment.
          If you believe you may be experiencing a medical emergency, contact local emergency services.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>Use the app lawfully.</li>
          <li>Keep access to your account secure.</li>
          <li>Do not misuse the app, attempt to disrupt it, or access data that is not yours.</li>
        </ul>

        <h2>Content</h2>
        <p>
          You are responsible for content you create in the app. We may update features over time.
        </p>

        <h2>Availability</h2>
        <p>
          We aim for high availability but do not guarantee uninterrupted access. Features may change or be discontinued.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, SeedMind will not be liable for indirect or consequential damages
          arising out of your use of the app.
        </p>

        <h2>Contact</h2>
        <p>
          For support, see the Support page for the current contact method.
        </p>
      </section>
    </>
  );
}

