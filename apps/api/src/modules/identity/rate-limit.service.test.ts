import { describe, expect, it } from 'vitest';

import { LoginRateLimitService } from './rate-limit.service.js';

describe('LoginRateLimitService', () => {
  it('blocks a sixth login attempt inside the configured window', () => {
    const limiter = new LoginRateLimitService();
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(limiter.consume('admin', 1000)).toBe(true);
    expect(limiter.consume('admin', 1000)).toBe(false);
  });
});
