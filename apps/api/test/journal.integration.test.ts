import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JournalService } from '../src/modules/journals/journal.service.js';

describe('journal isolation integration', () => {
  const service = new JournalService();
  const suffix = randomUUID();
  let firstUserId: string;
  let secondUserId: string;
  let firstJournalId: string;
  let secondJournalId: string;

  beforeAll(async () => {
    const passwordHash = await hash(`Journal-Test-A1-${suffix}`);
    const [first, second] = await Promise.all([
      database.user.create({
        data: {
          email: `journal-first-${suffix}@aksara.local`,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      }),
      database.user.create({
        data: {
          email: `journal-second-${suffix}@aksara.local`,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
    firstUserId = first.id;
    secondUserId = second.id;
    const firstJournal = await service.create(
      {
        slug: `journal-first-${suffix}`,
        title: 'Jurnal Integrasi Pertama',
        abbreviation: 'JIP',
        description: 'Jurnal fiktif untuk menguji batas tenant pertama.',
        scope: 'Pengujian integrasi, keamanan tenant, dan kebijakan akses jurnal.',
        contactEmail: first.email,
        primaryLanguage: 'id',
        reviewModel: 'DOUBLE_ANONYMOUS',
        status: 'PUBLISHED',
        submissionsOpen: false,
      },
      first.id,
      `journal-test-${suffix}`,
    );
    const secondJournal = await service.create(
      {
        slug: `journal-second-${suffix}`,
        title: 'Jurnal Integrasi Kedua',
        abbreviation: 'JIK',
        description: 'Jurnal fiktif untuk menguji batas tenant kedua.',
        scope: 'Pengujian isolasi jurnal dan penolakan akses lintas tenant.',
        contactEmail: second.email,
        primaryLanguage: 'id',
        reviewModel: 'SINGLE_ANONYMOUS',
        status: 'DRAFT',
        submissionsOpen: false,
      },
      second.id,
      `journal-test-${suffix}`,
    );
    firstJournalId = firstJournal.id;
    secondJournalId = secondJournal.id;
  });

  afterAll(async () => {
    await database.journal.deleteMany({ where: { id: { in: [firstJournalId, secondJournalId] } } });
    await database.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await database.$disconnect();
  });

  it('enforces journal-scoped management permissions', async () => {
    await expect(
      service.canManage(firstJournalId, firstUserId, null, 'journal.settings.manage'),
    ).resolves.toBe(true);
    await expect(
      service.canManage(secondJournalId, firstUserId, null, 'journal.settings.manage'),
    ).resolves.toBe(false);
    await expect(
      service.canManage(secondJournalId, firstUserId, 'PLATFORM_ADMIN', 'journal.settings.manage'),
    ).resolves.toBe(true);
  });

  it('returns only published journals through the public contract', async () => {
    const publicJournals = await service.listPublic();
    expect(publicJournals.some(({ id }) => id === firstJournalId)).toBe(true);
    expect(publicJournals.some(({ id }) => id === secondJournalId)).toBe(false);
  });

  it('keeps sections, article types, and declarations inside the owning journal', async () => {
    const section = await service.createSection(
      firstJournalId,
      {
        slug: 'data-science',
        title: 'Data science',
        description: 'Seksi fiktif untuk naskah metode dan evaluasi.',
        isActive: true,
      },
      firstUserId,
      `journal-config-${suffix}`,
    );
    expect(section).not.toBe('conflict');
    if (typeof section === 'string') throw new Error('section was not created');

    const foreignUpdate = await service.updateSection(
      secondJournalId,
      section.id,
      { title: 'Percobaan lintas jurnal' },
      secondUserId,
      `journal-config-${suffix}`,
    );
    expect(foreignUpdate).toBeNull();

    const invalidType = await service.createArticleType(
      secondJournalId,
      {
        slug: 'research-article',
        title: 'Research article',
        sectionId: section.id,
      },
      secondUserId,
      `journal-config-${suffix}`,
    );
    expect(invalidType).toBe('invalid-section');

    const articleType = await service.createArticleType(
      firstJournalId,
      {
        slug: 'research-article',
        title: 'Research article',
        sectionId: section.id,
        peerReviewRequired: true,
      },
      firstUserId,
      `journal-config-${suffix}`,
    );
    expect(articleType).not.toBe('conflict');
    expect(articleType).not.toBe('invalid-section');

    await service.createChecklistItem(
      firstJournalId,
      { label: 'Naskah mengikuti template jurnal dan belum diterbitkan di tempat lain.' },
      firstUserId,
      `journal-config-${suffix}`,
    );

    const declaration = await service.createDeclaration(
      firstJournalId,
      {
        code: 'conflict-of-interest',
        title: 'Konflik kepentingan',
        body: 'Penulis menyatakan seluruh sumber pendanaan dan konflik kepentingan yang relevan.',
      },
      firstUserId,
      `journal-config-${suffix}`,
    );
    expect(declaration).not.toBe('conflict');
    if (typeof declaration === 'string') throw new Error('declaration was not created');

    const versioned = await service.updateDeclaration(
      firstJournalId,
      declaration.id,
      {
        body: 'Penulis menyatakan konflik kepentingan, sumber dana, dan peran setiap kontributor secara lengkap.',
      },
      firstUserId,
      `journal-config-${suffix}`,
    );
    expect(versioned && typeof versioned !== 'string' && versioned.version).toBe(2);

    const publicJournal = await service.getPublic(`journal-first-${suffix}`);
    expect(publicJournal?.sections.some(({ slug }) => slug === 'data-science')).toBe(true);
    expect(publicJournal?.articleTypes.some(({ slug }) => slug === 'research-article')).toBe(true);
    expect(publicJournal?.declarations.some(({ version }) => version === 2)).toBe(true);
    expect(publicJournal?.declarations.some(({ version }) => version === 1)).toBe(false);

    const draftPublic = await service.getPublic(`journal-second-${suffix}`);
    expect(draftPublic).toBeNull();
  });
});
