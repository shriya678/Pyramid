import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * Development-only debug endpoints. Registered conditionally in AppModule
 * (only when NODE_ENV !== 'production'). Hidden from Swagger.
 */
@ApiExcludeController()
@Controller('debug')
export class DebugController {
  @Get('sentry-error')
  triggerSentryError(): never {
    // Verifies the Sentry pipeline end-to-end: this throws a real Error,
    // the global SentryExceptionFilter catches it (status 500), reports it
    // to Sentry with request-id / user tags, then returns a 500 to the client.
    throw new Error('Deliberate error from /debug/sentry-error — verifies Sentry capture.');
  }

  @Get('not-found-example')
  triggerNotFound(): never {
    // Verifies the filter does NOT ship expected 4xx errors to Sentry.
    throw new NotFoundException('Deliberate 404 — should NOT hit Sentry.');
  }
}
