import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { loggerConfig } from './common/logger/logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SentryModule } from './common/sentry/sentry.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { DebugModule } from './modules/debug/debug.module';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    LoggerModule.forRoot(loggerConfig()),
    ThrottlerModule.forRoot([
      {
        ttl: Number.parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
        limit: Number.parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
      },
    ]),
    PrismaModule,
    SentryModule,
    HealthModule,
    // Debug endpoints are dev-only. Excluded from the production bundle at runtime.
    ...(isProd ? [] : [DebugModule]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // RequestIdMiddleware runs before pino-http so `req.id` is set before the
    // logger sees it. Ordering matters — nestjs-pino's own middleware is
    // registered by LoggerModule.forRoot, and Nest runs middleware in the
    // order they're declared (this one first via configure()).
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
