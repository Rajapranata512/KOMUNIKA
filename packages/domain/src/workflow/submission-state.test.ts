import { describe, expect, it } from 'vitest';

import { canTransitionSubmission } from './submission-state.js';

describe('submission workflow', () => {
  it('allows the documented draft finalization transition', () => {
    expect(canTransitionSubmission('DRAFT', 'SUBMITTED')).toBe(true);
  });

  it('does not allow published content to return to an unpublished state', () => {
    expect(canTransitionSubmission('PUBLISHED', 'PRODUCTION')).toBe(false);
  });

  it('uses an explicit retraction transition for published content', () => {
    expect(canTransitionSubmission('PUBLISHED', 'RETRACTED')).toBe(true);
  });
});
