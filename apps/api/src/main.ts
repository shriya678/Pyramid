// Sentry MUST be initialized before any other imports so its auto-instrumentation
// can install http/express hooks before those modules are required.
import './instrument';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Swap Nest's default console logger for pino (configured in AppModule).
  app.useLogger(app.get(Logger));

  // --- Security & platform middleware ---
  app.use(helmet());

  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',').map((s) => s.trim()) ?? true,
    credentials: false, // Bearer tokens, not cookies
  });

  // --- Global request-body validation and mass-assignment protection ---
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // --- Swagger auto-docs ---
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Task Management API')
    .setDescription('REST API for the task management system.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
}

void bootstrap();
