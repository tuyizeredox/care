import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Liveness and readiness for the hosting platform.
 *
 * Render (and any other orchestrator) polls this to decide whether a deploy
 * succeeded and whether to keep routing traffic here. It must be public and
 * cheap, and it must actually touch the database — a process that is up but
 * cannot reach Postgres is not ready to serve.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service health, including database connectivity' })
  async check() {
    const startedQueryAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // The message stays generic: this endpoint is unauthenticated.
      throw new ServiceUnavailableException('The service is not ready.');
    }

    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      database: { status: 'up', latencyMs: Date.now() - startedQueryAt },
      timestamp: new Date().toISOString(),
    };
  }
}
