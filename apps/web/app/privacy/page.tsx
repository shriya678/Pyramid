export const metadata = { title: 'Privacy Policy' };

/**
 * Placeholder — lorem-ipsum until real legal copy is drafted. Exists so the
 * login screen's "Privacy Policy" link doesn't 404.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: placeholder</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-foreground">
          <p>
            <strong>Placeholder — not legal advice.</strong> This stub exists for an assessment
            project. A real privacy policy would replace it.
          </p>
          <p>
            The demo stores your email, display name, and workspace contents in a Postgres database.
            Guest sessions are deleted 30 days after last activity. Google account data is limited
            to the OAuth basic profile scope. No third-party analytics, no marketing cookies.
          </p>
        </section>

        <a
          href="/login"
          className="mt-12 inline-block text-sm font-medium text-primary hover:underline"
        >
          ← Back to login
        </a>
      </div>
    </main>
  );
}
