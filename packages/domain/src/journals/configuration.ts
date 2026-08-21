export const journalTemplateKinds = [
  'AUTHOR_GUIDELINES',
  'MANUSCRIPT_TEMPLATE',
  'COPYRIGHT_NOTICE',
  'DECISION_REJECT',
  'DECISION_MAJOR_REVISION',
  'DECISION_MINOR_REVISION',
  'DECISION_ACCEPT',
] as const;

export type JournalTemplateKind = (typeof journalTemplateKinds)[number];
