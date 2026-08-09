import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/**
 * Global exception filter. Two jobs:
 *   1. Format the HTTP response consistently for the client.
 *   2. Forward unexpected errors (5xx or non-HttpException) to Sentry,
 *      tagged with request-id and (if authenticated) user + workspace.
 * Expected HTTP errors (4xx) are logged but not sent to Sentry.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<
      Request & { id?: string; user?: { id: string }; workspace?: { slug: string } }
    >();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    // Only ship unexpected errors to Sentry.
    if (status >= 500) {
      Sentry.withScope((scope) => {
        if (req.id) scope.setTag('request_id', req.id);
        if (req.user?.id) scope.setUser({ id: req.user.id });
        if (req.workspace?.slug) scope.setTag('workspace_slug', req.workspace.slug);
        scope.setTag('http_method', req.method);
        scope.setTag('http_route', req.route?.path ?? req.url);
        Sentry.captureException(exception);
      });
      this.logger.error(
        `[${req.id ?? '-'}] ${req.method} ${req.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body =
      typeof message === 'string'
        ? { statusCode: status, message, requestId: req.id }
        : { ...(message as object), statusCode: status, requestId: req.id };

    httpAdapter.reply(res, body, status);
  }
}
