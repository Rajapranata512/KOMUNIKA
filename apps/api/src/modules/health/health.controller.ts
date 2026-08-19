import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  readiness(): { status: 'ready' } {
    return { status: 'ready' };
  }

  @Get('liveness')
  liveness(): { status: 'alive' } {
    return { status: 'alive' };
  }
}
