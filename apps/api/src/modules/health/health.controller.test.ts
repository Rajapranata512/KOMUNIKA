import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns a factual health state with an ISO timestamp', () => {
    const result = new HealthController({} as HealthService).health();

    expect(result.status).toBe('ok');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('delegates readiness to the dependency health check', async () => {
    const healthService = {
      readiness: async () => ({ status: 'ready' as const, checks: { database: 'up' as const } }),
    } as HealthService;

    await expect(new HealthController(healthService).readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
  });
});
