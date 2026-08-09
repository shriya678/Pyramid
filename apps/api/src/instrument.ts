// This file MUST be imported at the very top of main.ts, before any other imports,
// so @sentry/node can install its instrumentation hooks (http, express, etc.)
// before those modules are loaded.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Send request bodies/headers when available; PII redaction happens via pino's
    // redact list and the beforeSend hook below.
    sendDefaultPii: false,
    beforeSend(event) {
      // Belt-and-braces: strip Authorization header even if @sentry/node caught it.
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}
