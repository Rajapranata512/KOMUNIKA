import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JournalService } from '../src/modules/journals/journal.service.js';
import { SubmissionService } from '../src/modules/submissions/submission.service.js';

describe('author submission draft integration', () => {
  const suffix = randomUUID();
  const journals = new JournalService();
  const submissions = new SubmissionService();
  let authorId: string;
  let otherUserId: string;
  let journalId: string;
  let otherJournalId: string;
  let articleTypeId: string;
  let foreignArticleTypeId: string;
  let declarationId: string;
  let checklistItemId: string;
  let submissionId: string;

  beforeAll(async () => {
    const passwordHash = await hash(`Submission-Test-${suffix}`);
    const [author, other] = await Promise.all([
      database.user.create({
        data: {
          email: `submission-author-${suffix}@aksara.local`,
          passwordHash,
          fullName: 'Ayu Peneliti',
          affiliation: 'Universitas Fiktif Nusantara',
          emailVerifiedAt: new Date(),
        },
      }),
      database.user.create({
        data: {
          email: `submission-other-${suffix}@aksara.local`,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
    authorId = author.id;
    otherUserId = other.id;
    const first = await journals.create(
      {
        slug: `submission-journal-${suffix}`,
        title: 'Jurnal Submission Fiktif',
        abbreviation: 'JSF',
        description: 'Jurnal fiktif untuk pengujian submission author.',
        scope: 'Pengujian metadata, authorship, declarations, dan tenant isolation.',
        contactEmail: author.email,
        primaryLanguage: 'id',
        reviewModel: 'DOUBLE_ANONYMOUS',
        status: 'PUBLISHED',
        submissionsOpen: true,
      },
      author.id,
      `submission-${suffix}`,
    );
    const second = await journals.create(
      {
        slug: `submission-foreign-${suffix}`,
        title: 'Jurnal Tenant Lain',
        abbreviation: 'JTL',
        description: 'Jurnal fiktif kedua untuk pengujian tenant.',
        scope: 'Pengujian penolakan referensi artikel lintas jurnal.',
        contactEmail: other.email,
        primaryLanguage: 'en',
        reviewModel: 'SINGLE_ANONYMOUS',
        status: 'PUBLISHED',
        submissionsOpen: true,
      },
      other.id,
      `submission-${suffix}`,
    );
    journalId = first.id;
    otherJournalId = second.id;
    const [articleType, foreignType, declaration, checklist] = await Promise.all([
      journals.createArticleType(
        first.id,
        { slug: 'research', title: 'Artikel penelitian' },
        author.id,
        `submission-${suffix}`,
      ),
      journals.createArticleType(
        second.id,
        { slug: 'foreign', title: 'Foreign article' },
        other.id,
        `submission-${suffix}`,
      ),
      journals.createDeclaration(
        first.id,
        {
          code: 'conflict',
          title: 'Konflik kepentingan',
          body: 'Penulis mengungkapkan konflik kepentingan secara lengkap dan akurat.',
        },
        author.id,
        `submission-${suffix}`,
      ),
      journals.createChecklistItem(
        first.id,
        { label: 'Naskah mengikuti panduan jurnal dan belum diterbitkan.' },
        author.id,
        `submission-${suffix}`,
      ),
    ]);
    if (
      typeof articleType === 'string' ||
      typeof foreignType === 'string' ||
      typeof declaration === 'string'
    )
      throw new Error('submission fixtures were not created');
    articleTypeId = articleType.id;
    foreignArticleTypeId = foreignType.id;
    declarationId = declaration.id;
    checklistItemId = checklist.id;
  });

  afterAll(async () => {
    if (submissionId) {
      await database.submissionTimelineEvent.deleteMany({ where: { submissionId } });
      await database.submissionVersion.deleteMany({ where: { submissionId } });
      const attachedFiles = await database.submissionFile.findMany({
        where: { submissionId },
        select: { storedFileId: true },
      });
      await database.submissionFile.deleteMany({ where: { submissionId } });
      await database.storedFile.deleteMany({
        where: { id: { in: attachedFiles.map(({ storedFileId }) => storedFileId) } },
      });
      await database.submission.deleteMany({ where: { id: submissionId } });
    }
    await database.journal.deleteMany({ where: { id: { in: [journalId, otherJournalId] } } });
    await database.user.deleteMany({ where: { id: { in: [authorId, otherUserId] } } });
    await database.$disconnect();
  });

  it('creates an owned tenant-scoped draft with policy snapshots and an author timeline', async () => {
    const created = await submissions.createDraft(
      journalId,
      articleTypeId,
      authorId,
      `submission-${suffix}`,
    );
    expect(created).not.toBeNull();
    submissionId = created?.id ?? '';
    const detail = await submissions.getForAuthor(submissionId, authorId);
    expect(detail?.state).toBe('DRAFT');
    expect(detail?.authors).toHaveLength(1);
    expect(detail?.authors[0]?.isCorresponding).toBe(true);
    expect(detail?.declarations[0]).toMatchObject({
      declarationId,
      declarationVersion: 1,
      accepted: false,
    });
    expect(detail?.checklistAcceptances[0]).toMatchObject({
      checklistItemId,
      accepted: false,
    });
    expect(detail?.timeline[0]?.action).toBe('submission.draft_created');
  });

  it('autosaves ordered metadata while denying cross-owner and cross-journal access', async () => {
    const updated = await submissions.updateDraft(
      submissionId,
      authorId,
      {
        title: 'Metadata Submission yang Terjaga',
        abstract:
          'Abstrak fiktif yang menjelaskan tujuan, metode, hasil, pembahasan, dan simpulan penelitian secara lengkap untuk memenuhi validasi metadata submission.',
        authors: [
          {
            givenName: 'Ayu',
            familyName: 'Peneliti',
            email: `submission-author-${suffix}@aksara.local`,
            affiliation: 'Universitas Fiktif Nusantara',
            isCorresponding: true,
          },
          {
            givenName: 'Bima',
            familyName: 'Akademik',
            email: `coauthor-${suffix}@aksara.local`,
            affiliation: 'Institut Fiktif Indonesia',
            isCorresponding: false,
          },
        ],
        keywords: ['metadata', 'submission'],
        subjects: ['scholarly publishing'],
        declarationAcceptances: [{ declarationId, accepted: true }],
        checklistAcceptances: [{ checklistItemId, accepted: true }],
      },
      `submission-${suffix}`,
    );
    expect(typeof updated).toBe('object');
    if (!updated || typeof updated === 'string') throw new Error('draft was not updated');
    expect(updated.authors.map(({ givenName }) => givenName)).toEqual(['Ayu', 'Bima']);
    expect(updated.keywords.map(({ value }) => value)).toEqual(['metadata', 'submission']);
    expect(updated.declarations[0]?.acceptedAt).toBeInstanceOf(Date);
    await expect(submissions.getForAuthor(submissionId, otherUserId)).resolves.toBeNull();
    await expect(
      submissions.updateDraft(
        submissionId,
        otherUserId,
        { title: 'Percobaan pengambilalihan' },
        `submission-${suffix}`,
      ),
    ).resolves.toBeNull();
    await expect(
      submissions.updateDraft(
        submissionId,
        authorId,
        { articleTypeId: foreignArticleTypeId },
        `submission-${suffix}`,
      ),
    ).resolves.toBe('invalid-article-type');
  });

  it('validates and finalizes once with an immutable version and receipt timeline', async () => {
    const storedFile = await database.storedFile.create({
      data: {
        journalId,
        uploaderId: authorId,
        storageKey: `test/${suffix}/manuscript`,
        originalName: 'manuscript.pdf',
        declaredMime: 'application/pdf',
        detectedMime: 'application/pdf',
        size: 1024,
        checksumSha256: 'a'.repeat(64),
        scanStatus: 'CLEAN',
        visibility: 'PRIVATE',
        uploadedAt: new Date(),
        scannedAt: new Date(),
      },
    });
    await database.submissionFile.create({
      data: { submissionId, storedFileId: storedFile.id, purpose: 'MANUSCRIPT' },
    });
    const idempotencyKey = `finalize-${suffix}`;
    const finalized = await submissions.finalize(
      submissionId,
      authorId,
      idempotencyKey,
      `submission-${suffix}`,
    );
    expect(
      finalized && typeof finalized === 'object' && 'state' in finalized && finalized.state,
    ).toBe('SUBMITTED');
    const repeated = await submissions.finalize(
      submissionId,
      authorId,
      idempotencyKey,
      `submission-${suffix}`,
    );
    expect(repeated && typeof repeated === 'object' && 'state' in repeated && repeated.state).toBe(
      'SUBMITTED',
    );
    await expect(database.submissionVersion.count({ where: { submissionId } })).resolves.toBe(1);
    await expect(
      submissions.updateDraft(
        submissionId,
        authorId,
        { title: 'Tidak boleh diubah' },
        `submission-${suffix}`,
      ),
    ).resolves.toBeNull();
  });
});
