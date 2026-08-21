import { database } from '@aksara/database';
import { afterAll, describe, expect, it } from 'vitest';

import { HealthService } from '../src/modules/health/health.service.js';

describe('dependency readiness integration', () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it('reports ready only after PostgreSQL answers a real query', async () => {
    await expect(new HealthService().readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
  });
});
