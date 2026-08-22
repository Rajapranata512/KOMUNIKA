import type { JournalRole, PlatformRole } from './roles.js';

export const journalPermissions = [
  'journal.read_private',
  'journal.settings.manage',
  'journal.memberships.manage',
  'submission.create',
  'submission.read_assigned',
  'review.read_assigned',
  'review.manage',
  'decision.manage',
  'production.manage',
  'publication.publish',
] as const;

export type JournalPermission = (typeof journalPermissions)[number];

const rolePermissions: Record<JournalRole, readonly JournalPermission[]> = {
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
};

export function hasJournalPermission(
  identity: {
    platformRole: PlatformRole | null;
    journalRoles: readonly JournalRole[];
  },
  permission: JournalPermission,
): boolean {
  if (identity.platformRole === 'PLATFORM_ADMIN') return true;
  return identity.journalRoles.some((role) => rolePermissions[role].includes(permission));
}
