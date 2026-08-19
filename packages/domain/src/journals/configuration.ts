export const journalTemplateKinds = [
  'AUTHOR_GUIDELINES',
  'MANUSCRIPT_TEMPLATE',
  'COPYRIGHT_NOTICE',
] as const;

export type JournalTemplateKind = (typeof journalTemplateKinds)[number];
