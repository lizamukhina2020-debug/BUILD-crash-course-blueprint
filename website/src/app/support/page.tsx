import Link from 'next/link';

export default function SupportPage() {
  return (
    <>
      <h1 className="pageTitle">Support</h1>
      <section className="card legal">
        <p>
          Need help with SeedMind? We’re here.
        </p>

        <h2>Contact</h2>
        <p>
          <strong>Email:</strong>{' '}
          <a href="mailto:seedmindsupport@gmail.com">seedmindsupport@gmail.com</a>
        </p>

        <h2>Common questions</h2>
        <ul>
          <li>
            <strong>Password reset:</strong> Use “Forgot password?” on the sign-in screen to receive a reset email.
          </li>
          <li>
            <strong>Data sync:</strong> If cloud sync is enabled, your progress should appear after signing in on a new device.
          </li>
          <li>
            <strong>Privacy:</strong> Read our <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>
      </section>
    </>
  );
}

