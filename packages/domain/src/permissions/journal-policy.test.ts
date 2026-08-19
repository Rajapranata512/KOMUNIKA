import { describe, expect, it } from 'vitest';

import { hasJournalPermission } from './journal-policy.js';

describe('journal permission policy', () => {
  it('allows platform administrators across journals', () => {
    expect(
      hasJournalPermission(
        { platformRole: 'PLATFORM_ADMIN', journalRoles: [] },
        'journal.settings.manage',
      ),
    ).toBe(true);
  });

  it('allows journal managers to manage settings and memberships', () => {
    const identity = { platformRole: null, journalRoles: ['JOURNAL_MANAGER'] as const };
    expect(hasJournalPermission(identity, 'journal.settings.manage')).toBe(true);
    expect(hasJournalPermission(identity, 'journal.memberships.manage')).toBe(true);
  });

  it('denies authors journal administration permissions', () => {
    expect(
      hasJournalPermission(
        { platformRole: null, journalRoles: ['AUTHOR'] },
        'journal.settings.manage',
      ),
    ).toBe(false);
  });
});
