import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { loggerConfig } from './common/logger/logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SentryModule } from './common/sentry/sentry.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { DebugModule } from './modules/debug/debug.module';
import { ActivityModule } from './modules/activity/activity.module';
import { CommentsModule } from './modules/comments/comments.module';
import { LabelsModule } from './modules/labels/labels.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { StatusesModule } from './modules/statuses/statuses.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

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
    AuthModule,
    WorkspacesModule,
    StatusesModule,
    LabelsModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    ResourcesModule,
    ActivityModule,
    PreferencesModule,
    HealthModule,
    // Debug endpoints are dev-only. Excluded from the production bundle at runtime.
    ...(isProd ? [] : [DebugModule]),
  ],
  providers: [
    // Order matters: throttler first (cheap, kills bots before touching auth),
    // then JWT auth (which respects @Public()). Both run on every request.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
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
