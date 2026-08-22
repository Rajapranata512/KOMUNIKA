import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  readiness() {
    return this.healthService.readiness();
  }

  @Get('liveness')
  liveness(): { status: 'alive' } {
    return { status: 'alive' };
  }
}
