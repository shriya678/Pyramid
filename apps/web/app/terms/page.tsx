export const metadata = { title: 'Terms of Service' };

/**
 * Placeholder — lorem-ipsum until real legal copy is drafted. Exists so the
 * login screen's "Terms of Service" link doesn't 404.
 */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: placeholder</p>

        <section className="mt-8 space-y-4 text-sm leading-relaxed text-foreground">
          <p>
            <strong>Placeholder — not legal advice.</strong> This is a stub page for an assessment
            project. Real terms would replace this before any production launch.
          </p>
          <p>
            By using this application you acknowledge it is a demonstration built for a technical
            assessment and not a production service. No warranties are offered.
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
