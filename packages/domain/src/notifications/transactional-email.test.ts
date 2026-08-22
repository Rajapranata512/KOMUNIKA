import { describe, expect, it } from 'vitest';

import { TRANSACTIONAL_EMAIL_JOB_OPTIONS, transactionalEmailJobId } from './transactional-email.js';

describe('transactional email contract', () => {
  it('creates BullMQ-safe idempotency keys without exposing a token', () => {
    const token = 'secret-token-that-must-not-appear';
    const id = transactionalEmailJobId('identity.verify-email', 'd34db33f');

    expect(id).toBe('identity-verify-email-d34db33f');
    expect(id).not.toContain(token);
    expect(id).not.toContain(':');
  });

  it('defines bounded retry and failed-job retention', () => {
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.attempts).toBe(5);
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.removeOnFail.age).toBe(86_400);
  });
});
