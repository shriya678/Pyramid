// Runs in the browser. Auto-loaded by @sentry/nextjs when Sentry is enabled.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Sends session replay for a small fraction of sessions and on error.
    // Cheap way to get click-by-click reproductions for a demo.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // No PII in requests; the app never puts secrets in URLs.
    sendDefaultPii: false,
  });
}
