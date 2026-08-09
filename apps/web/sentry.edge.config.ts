// Runs in the Edge runtime (middleware, Route Handlers with `export const runtime = 'edge'`).
// Auto-loaded by @sentry/nextjs when Sentry is enabled.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
