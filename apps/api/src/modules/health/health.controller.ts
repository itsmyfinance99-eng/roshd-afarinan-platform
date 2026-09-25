import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ServiceUnavailableError } from '../../common/errors/app-exception';
import { HealthRegistry, type ReadinessReport } from './health.registry';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly registry: HealthRegistry) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: the process is up' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: dependencies are reachable' })
  async ready(): Promise<ReadinessReport> {
    const report = await this.registry.readiness();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableError(
        undefined,
        Object.entries(report.checks)
          .filter(([, state]) => state === 'down')
          .map(([name]) => ({ path: name, message: 'down' })),
      );
    }
    return report;
  }
}
