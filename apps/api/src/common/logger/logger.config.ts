import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

/**
 * Pino logger configuration. Structured JSON logs in production; pretty-printed
 * in development. Request-id from RequestIdMiddleware is propagated as `reqId`
 * so every log line inside a request can be correlated with the request that
 * produced it (and with the Sentry event that shares the same request-id).
 *
 * `genReqId` is the single source of truth for the id — pino-http calls it
 * before any Nest middleware runs, so the earlier design (middleware first,
 * pino reads its output) was order-dependent and produced literal
 * "undefined" strings when the middleware hadn't yet executed. Now we
 * generate here and stash on `req.id`; the middleware just mirrors it into
 * the `x-request-id` response header.
 */
export const loggerConfig = (): Params => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
      genReqId: (req: IncomingMessage) => {
        const r = req as IncomingMessage & { id?: string };
        if (r.id) return r.id;
        const header = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof header === 'string' && header.length > 0 && header.length <= 128
            ? header
            : randomUUID();
        r.id = id;
        return id;
      },
      customProps: (req: IncomingMessage) => ({
        reqId: (req as IncomingMessage & { id?: string }).id,
      }),
      // Redact known secret-bearing fields defensively.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.passwordHash',
          'req.body.refreshToken',
          'req.body.accessToken',
        ],
        censor: '[REDACTED]',
      },
      // Health checks are noisy; drop them to warn+ in prod so they don't spam.
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,reqId',
              messageFormat: '[{reqId}] {msg}',
            },
          },
    },
  };
};

export type LogRequest = IncomingMessage & { id?: string };
export type LogResponse = ServerResponse;
