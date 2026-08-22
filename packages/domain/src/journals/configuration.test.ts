import { describe, expect, it } from 'vitest';

import { journalTemplateKinds } from './configuration.js';

describe('journal configuration vocabulary', () => {
  it('keeps template kinds limited to author-facing journal documents', () => {
    expect(journalTemplateKinds).toEqual([
      'AUTHOR_GUIDELINES',
      'MANUSCRIPT_TEMPLATE',
      'COPYRIGHT_NOTICE',
      'DECISION_REJECT',
      'DECISION_MAJOR_REVISION',
      'DECISION_MINOR_REVISION',
      'DECISION_ACCEPT',
    ]);
  });
});
