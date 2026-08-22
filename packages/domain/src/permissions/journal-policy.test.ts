import { describe, expect, it } from 'vitest';

import { hasJournalPermission, journalPermissions } from './journal-policy.js';

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

  it('reserves publication release for the editor in chief', () => {
    expect(
      hasJournalPermission(
        { platformRole: null, journalRoles: ['EDITOR_IN_CHIEF'] },
        'publication.publish',
      ),
    ).toBe(true);
    expect(
      hasJournalPermission(
        { platformRole: null, journalRoles: ['PRODUCTION_EDITOR'] },
        'publication.publish',
      ),
    ).toBe(false);
    expect(
      hasJournalPermission(
        { platformRole: null, journalRoles: ['JOURNAL_MANAGER'] },
        'publication.publish',
      ),
    ).toBe(false);
  });

  it('matches the complete deny-by-default role and permission matrix', () => {
    const expected = {
      AUTHOR: ['submission.create'],
      REVIEWER: ['review.read_assigned'],
      COPYEDITOR: ['journal.read_private', 'production.manage'],
      PRODUCTION_EDITOR: ['journal.read_private', 'production.manage'],
      SECTION_EDITOR: [
        'journal.read_private',
        'submission.read_assigned',
        'review.manage',
        'decision.manage',
      ],
      EDITOR_IN_CHIEF: [
        'journal.read_private',
        'submission.read_assigned',
        'review.manage',
        'decision.manage',
        'production.manage',
        'publication.publish',
      ],
      JOURNAL_MANAGER: [
        'journal.read_private',
        'journal.settings.manage',
        'journal.memberships.manage',
        'production.manage',
      ],
    } as const;
    for (const [role, allowed] of Object.entries(expected)) {
      for (const permission of journalPermissions) {
        expect(
          hasJournalPermission(
            { platformRole: null, journalRoles: [role as keyof typeof expected] },
            permission,
          ),
          role + ' / ' + permission,
        ).toBe(allowed.includes(permission as never));
      }
    }
    for (const permission of journalPermissions) {
      expect(hasJournalPermission({ platformRole: null, journalRoles: [] }, permission)).toBe(
        false,
      );
    }
  });

  it('combines multiple journal roles without broadening beyond their union', () => {
    const identity = { platformRole: null, journalRoles: ['AUTHOR', 'REVIEWER'] as const };
    expect(hasJournalPermission(identity, 'submission.create')).toBe(true);
    expect(hasJournalPermission(identity, 'review.read_assigned')).toBe(true);
    expect(hasJournalPermission(identity, 'journal.read_private')).toBe(false);
    expect(hasJournalPermission(identity, 'publication.publish')).toBe(false);
  });
});
