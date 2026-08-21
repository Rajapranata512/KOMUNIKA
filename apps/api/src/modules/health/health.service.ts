import { database, Prisma } from '@aksara/database';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  async readiness() {
    try {
      await database.$queryRaw(Prisma.sql`SELECT 1`);
      return { status: 'ready' as const, checks: { database: 'up' as const } };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'health.readiness_failed',
          dependency: 'database',
          errorType: error instanceof Error ? error.name : 'unknown',
        }),
      );
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { database: 'down' },
      });
    }
  }
}
