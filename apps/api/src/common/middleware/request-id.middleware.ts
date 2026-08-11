import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Mirrors `req.id` (set by pino-http's genReqId before Nest middleware runs)
 * into the `x-request-id` response header so clients can echo it back. If
 * genReqId didn't run for some reason (misconfig, test harness bypassing
 * pino), falls back to generating one here.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const r = req as Request & { id?: string };
    if (!r.id) {
      const incoming = req.header(REQUEST_ID_HEADER);
      r.id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : randomUUID();
    }
    res.setHeader(REQUEST_ID_HEADER, r.id);
    next();
  }
}
