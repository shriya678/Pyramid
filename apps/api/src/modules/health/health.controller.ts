import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Liveness + database ping. Used by the frontend hello-world page and by uptime checks.',
  })
  async check() {
    let db: 'up' | 'down' = 'down';
    let dbLatencyMs: number | null = null;
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
      dbLatencyMs = Date.now() - start;
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      dbLatencyMs,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      env: process.env.NODE_ENV ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
