export const journalRoles = [
  'AUTHOR',
  'REVIEWER',
  'COPYEDITOR',
  'PRODUCTION_EDITOR',
  'SECTION_EDITOR',
  'EDITOR_IN_CHIEF',
  'JOURNAL_MANAGER',
] as const;

export const platformRoles = ['PLATFORM_ADMIN'] as const;

export type JournalRole = (typeof journalRoles)[number];
export type PlatformRole = (typeof platformRoles)[number];
