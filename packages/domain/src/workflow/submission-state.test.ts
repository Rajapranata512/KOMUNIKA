import { describe, expect, it } from 'vitest';

import { canTransitionSubmission, getAuthorProgressPhase } from './submission-state.js';

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

  it('summarizes detailed editorial states without changing the state machine', () => {
    expect(getAuthorProgressPhase('SUBMITTED')).toBe('WAITING');
    expect(getAuthorProgressPhase('UNDER_REVIEW')).toBe('REVIEWED');
    expect(getAuthorProgressPhase('RESUBMITTED')).toBe('EVALUATION');
    expect(getAuthorProgressPhase('PRODUCTION')).toBe('ACCEPTED');
    expect(getAuthorProgressPhase('REJECTED')).toBeNull();
  });
});
