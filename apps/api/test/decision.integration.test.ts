import { randomUUID } from 'node:crypto';

import { database, Prisma } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DecisionService } from '../src/modules/decisions/decision.service.js';
import { ReviewService } from '../src/modules/reviews/review.service.js';
import { SubmissionService } from '../src/modules/submissions/submission.service.js';

describe('editorial decisions and immutable revisions integration', () => {
  const suffix = randomUUID();
  const enqueue = vi.fn().mockResolvedValue('queued');
  const decisions = new DecisionService({ enqueue } as never);
  const reviews = new ReviewService(
    { enqueue } as never,
    { enqueue: vi.fn().mockResolvedValue('queued') } as never,
  );
  const submissions = new SubmissionService();
  const userIds: string[] = [];
  const submissionIds: string[] = [];
  const storedFileIds: string[] = [];
  let chiefId = '';
  let authorId = '';
  let reviewerId = '';
  let outsiderId = '';
  let journalId = '';
  let submissionId = '';
  let versionId = '';
  let responseId = '';
  let reviewFileId = '';
  let reviewFormId = '';

  beforeAll(async () => {
    const passwordHash = await hash('Decision-' + suffix);
    const users = await Promise.all(
      ['chief', 'author', 'reviewer', 'outsider'].map((name) =>
        database.user.create({
          data: {
            email: 'decision-' + name + '-' + suffix + '@aksara.local',
            passwordHash,
            fullName: 'Decision ' + name,
            emailVerifiedAt: new Date(),
          },
        }),
      ),
    );
    [chiefId, authorId, reviewerId, outsiderId] = users.map(({ id }) => id);
    userIds.push(...users.map(({ id }) => id));
    const journal = await database.journal.create({
      data: {
        slug: 'decision-' + suffix,
        title: 'Jurnal Keputusan Fiktif',
        abbreviation: 'JKF',
        description: 'Fixture keputusan editorial dan revisi.',
        scope: 'Pengujian keputusan, release review, dan immutable version.',
        contactEmail: users[0]?.email ?? 'editor@example.test',
        reviewModel: 'DOUBLE_ANONYMOUS',
        status: 'PUBLISHED',
        submissionsOpen: true,
        createdById: chiefId,
        memberships: {
          create: [
            { userId: chiefId, role: 'EDITOR_IN_CHIEF' },
            { userId: reviewerId, role: 'REVIEWER' },
          ],
        },
        reviewerProfiles: { create: { userId: reviewerId, languages: ['id'] } },
        articleTypes: {
          create: [
            { slug: 'reviewed', title: 'Reviewed article', peerReviewRequired: true },
            { slug: 'editorial', title: 'Editorial', peerReviewRequired: false },
          ],
        },
        reviewForms: {
          create: {
            name: 'Form keputusan',
            version: 1,
            questions: {
              create: {
                prompt: 'Berikan evaluasi utama.',
                type: 'LONG_TEXT',
                required: true,
                sortOrder: 0,
              },
            },
          },
        },
      },
      include: { articleTypes: true, reviewForms: true },
    });
    journalId = journal.id;
    reviewFormId = journal.reviewForms[0]?.id ?? '';
    const reviewedTypeId = journal.articleTypes.find(({ slug }) => slug === 'reviewed')?.id;
    if (!reviewedTypeId || !reviewFormId) throw new Error('Decision fixture missing.');
    const submission = await database.submission.create({
      data: {
        journalId,
        submitterId: authorId,
        articleTypeId: reviewedTypeId,
        state: 'UNDER_REVIEW',
        title: 'Naskah keputusan dan revisi fiktif',
        abstract: 'Abstrak fiktif untuk menguji keputusan editorial dan riwayat versi immutable.',
        submittedAt: new Date(),
        authors: {
          create: {
            userId: authorId,
            givenName: 'Author',
            familyName: 'Rahasia',
            email: users[1]?.email ?? '',
            affiliation: 'Institusi Fiktif',
            isCorresponding: true,
            sortOrder: 0,
          },
        },
        editorialAssignments: {
          create: {
            journalId,
            editorId: chiefId,
            assignedById: chiefId,
            assignmentNote: 'Tangani keputusan.',
          },
        },
      },
    });
    submissionId = submission.id;
    submissionIds.push(submission.id);
    const source = await database.storedFile.create({
      data: {
        journalId,
        uploaderId: authorId,
        storageKey: 'decisions/' + suffix + '/source',
        originalName: 'source-v1.pdf',
        declaredMime: 'application/pdf',
        detectedMime: 'application/pdf',
        size: 100,
        scanStatus: 'CLEAN',
        visibility: 'REVIEWER',
        uploadedAt: new Date(),
        scannedAt: new Date(),
      },
    });
    storedFileIds.push(source.id);
    await database.submissionFile.create({
      data: { submissionId, storedFileId: source.id, purpose: 'MANUSCRIPT' },
    });
    const version = await database.submissionVersion.create({
      data: {
        submissionId,
        version: 1,
        snapshot: {
          title: submission.title,
          authors: [{ givenName: 'Author', familyName: 'Rahasia' }],
          files: [{ purpose: 'MANUSCRIPT', fileId: source.id, originalName: source.originalName }],
        } as Prisma.InputJsonValue,
      },
    });
    versionId = version.id;
    const reviewerFile = await database.storedFile.create({
      data: {
        journalId,
        uploaderId: reviewerId,
        storageKey: 'decisions/' + suffix + '/review',
        originalName: 'reviewer-notes.pdf',
        declaredMime: 'application/pdf',
        detectedMime: 'application/pdf',
        size: 80,
        scanStatus: 'CLEAN',
        visibility: 'EDITORIAL_TEAM',
        uploadedAt: new Date(),
        scannedAt: new Date(),
      },
    });
    storedFileIds.push(reviewerFile.id);
    const round = await database.reviewRound.create({
      data: {
        journalId,
        submissionId,
        submissionVersionId: version.id,
        reviewFormId,
        assignedEditorId: chiefId,
        sequence: 1,
      },
    });
    const invitation = await database.reviewInvitation.create({
      data: {
        journalId,
        roundId: round.id,
        reviewerId,
        invitedById: chiefId,
        tokenHash: 'token-' + suffix,
        status: 'ACCEPTED',
        conflictStatus: 'NO_CONFLICT',
        responseDeadline: new Date(Date.now() + 5 * 86_400_000),
        reviewDeadline: new Date(Date.now() + 10 * 86_400_000),
        respondedAt: new Date(),
        tokenUsedAt: new Date(),
      },
    });
    const assignment = await database.reviewAssignment.create({
      data: {
        roundId: round.id,
        invitationId: invitation.id,
        reviewerId,
        submissionVersionId: version.id,
        dueAt: invitation.reviewDeadline,
        lockedAt: new Date(),
        response: {
          create: {
            status: 'SUBMITTED',
            commentsToAuthor: 'Komentar konstruktif yang aman untuk dirilis kepada author.',
            confidentialComments: 'Komentar rahasia yang tidak boleh diterima author.',
            recommendation: 'MAJOR_REVISION',
            submittedAt: new Date(),
          },
        },
      },
      include: { response: true },
    });
    responseId = assignment.response?.id ?? '';
    const reviewFile = await database.reviewFile.create({
      data: {
        responseId,
        storedFileId: reviewerFile.id,
        authorVisible: true,
      },
    });
    reviewFileId = reviewFile.id;
  });

  afterAll(async () => {
    await database.submission.updateMany({
      where: { id: { in: submissionIds } },
      data: { acceptedVersionId: null },
    });
    await database.decisionReviewFileRelease.deleteMany({
      where: { decision: { submissionId: { in: submissionIds } } },
    });
    await database.decisionReviewRelease.deleteMany({
      where: { decision: { submissionId: { in: submissionIds } } },
    });
    await database.decisionLetter.deleteMany({
      where: { decision: { submissionId: { in: submissionIds } } },
    });
    await database.reviewAnswer.deleteMany({
      where: { response: { assignment: { round: { submissionId: { in: submissionIds } } } } },
    });
    await database.reviewFile.deleteMany({
      where: { response: { assignment: { round: { submissionId: { in: submissionIds } } } } },
    });
    await database.reviewResponse.deleteMany({
      where: { assignment: { round: { submissionId: { in: submissionIds } } } },
    });
    await database.reviewAssignment.deleteMany({
      where: { round: { submissionId: { in: submissionIds } } },
    });
    await database.reviewInvitation.deleteMany({
      where: { round: { submissionId: { in: submissionIds } } },
    });
    await database.submissionFile.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.revision.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await database.editorialDecision.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.reviewRound.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await database.editorialAssignment.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submissionTimelineEvent.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submissionAuthor.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submissionVersion.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submission.deleteMany({ where: { id: { in: submissionIds } } });
    await database.storedFile.deleteMany({ where: { id: { in: storedFileIds } } });
    await database.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await database.journal.deleteMany({ where: { id: journalId } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });

  it('releases only selected review content and creates an immutable revision request', async () => {
    await expect(
      decisions.decide(
        submissionId,
        outsiderId,
        {
          type: 'MAJOR_REVISION',
          reason: 'Alasan internal editorial yang tidak boleh terlihat oleh author.',
          subject: 'Keputusan revisi mayor',
          body: 'Silakan kirim revisi dengan tanggapan lengkap terhadap komentar yang dipilih.',
          revisionDueAt: new Date(Date.now() + 30 * 86_400_000),
          responseRequired: true,
          evaluationMode: 'EXTERNAL_REVIEW',
          releaseResponseIds: [responseId],
          releaseReviewFileIds: [reviewFileId],
        },
        'decision-' + suffix,
      ),
    ).resolves.toBe('forbidden');
    const result = await decisions.decide(
      submissionId,
      chiefId,
      {
        type: 'MAJOR_REVISION',
        reason: 'Alasan internal editorial yang tidak boleh terlihat oleh author.',
        subject: 'Keputusan revisi mayor',
        body: 'Silakan kirim revisi dengan tanggapan lengkap terhadap komentar yang dipilih.',
        revisionDueAt: new Date(Date.now() + 30 * 86_400_000),
        responseRequired: true,
        evaluationMode: 'EXTERNAL_REVIEW',
        releaseResponseIds: [responseId],
        releaseReviewFileIds: [reviewFileId],
      },
      'decision-' + suffix,
    );
    expect(typeof result).toBe('object');
    const author = await submissions.getForAuthor(submissionId, authorId);
    expect(author?.state).toBe('REVISION_REQUIRED');
    expect(author?.editorialDecisions[0]).toMatchObject({
      type: 'MAJOR_REVISION',
      letter: { subject: 'Keputusan revisi mayor' },
      reviewReleases: [
        { commentsToAuthorSnapshot: 'Komentar konstruktif yang aman untuk dirilis kepada author.' },
      ],
    });
    expect(JSON.stringify(author)).not.toContain(
      'Komentar rahasia yang tidak boleh diterima author.',
    );
    expect(JSON.stringify(author)).not.toContain('Alasan internal editorial');
    expect(author?.editorialDecisions[0]?.fileReleases).toHaveLength(1);
    expect(
      await database.reviewRound.findFirstOrThrow({ where: { submissionId, sequence: 1 } }),
    ).toMatchObject({ closedAt: expect.any(Date) });
    expect(
      await database.reviewAssignment.findFirstOrThrow({ where: { round: { submissionId } } }),
    ).toMatchObject({ active: false });
    const revision = await database.revision.findFirstOrThrow({
      where: { submissionId, submittedAt: null },
    });
    await expect(
      decisions.remindRevision(revision.id, outsiderId, 'decision-' + suffix),
    ).resolves.toBe('forbidden');
    await expect(
      decisions.remindRevision(revision.id, chiefId, 'decision-' + suffix),
    ).resolves.toBe('sent');
    await expect(
      decisions.remindRevision(revision.id, chiefId, 'decision-' + suffix),
    ).resolves.toBe('too-soon');
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'editorial.revision-reminder',
        submissionId,
      }),
      expect.any(String),
    );
  });

  it('creates version two without mutating version one and enforces the external next-round route', async () => {
    const revision = await database.revision.findFirstOrThrow({
      where: { submissionId, submittedAt: null },
    });
    const [manuscript, response] = await Promise.all(
      [
        ['revised-v2.pdf', 'MANUSCRIPT'],
        ['response-v2.pdf', 'RESPONSE'],
      ].map(async ([originalName, purpose]) => {
        const stored = await database.storedFile.create({
          data: {
            journalId,
            uploaderId: authorId,
            storageKey: 'decisions/' + suffix + '/' + purpose,
            originalName: originalName ?? '',
            declaredMime: 'application/pdf',
            detectedMime: 'application/pdf',
            size: 90,
            scanStatus: 'CLEAN',
            visibility: 'PRIVATE',
            uploadedAt: new Date(),
            scannedAt: new Date(),
          },
        });
        storedFileIds.push(stored.id);
        await database.submissionFile.create({
          data: {
            submissionId,
            storedFileId: stored.id,
            revisionId: revision.id,
            purpose: purpose as 'MANUSCRIPT' | 'RESPONSE',
          },
        });
        return stored;
      }),
    );
    await decisions.saveRevision(
      revision.id,
      authorId,
      'Tanggapan terstruktur untuk setiap komentar reviewer yang dirilis.',
      'revision-' + suffix,
    );
    const finalized = await decisions.finalizeRevision(
      revision.id,
      authorId,
      'revision-key-' + suffix,
      'revision-' + suffix,
    );
    expect(typeof finalized).toBe('object');
    expect(
      await database.submission.findUniqueOrThrow({ where: { id: submissionId } }),
    ).toMatchObject({ state: 'RESUBMITTED' });
    const versions = await database.submissionVersion.findMany({
      where: { submissionId },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ id: versionId, version: 1 });
    expect(versions[1]?.snapshot).toMatchObject({
      previousVersionId: versionId,
      responseToReviewers: 'Tanggapan terstruktur untuk setiap komentar reviewer yang dirilis.',
    });
    expect(JSON.stringify(versions[0]?.snapshot)).not.toContain(manuscript.id);
    expect(JSON.stringify(versions[1]?.snapshot)).toContain(response.id);
    await expect(
      decisions.decide(
        submissionId,
        chiefId,
        {
          type: 'ACCEPT',
          reason: 'Belum boleh accept karena jalur external review dipilih.',
          subject: 'Belum dapat diterima',
          body: 'Keputusan belum dapat diterbitkan sebelum round review baru diselesaikan.',
          responseRequired: false,
          releaseResponseIds: [],
          releaseReviewFileIds: [],
        },
        'decision-' + suffix,
      ),
    ).resolves.toBe('review-incomplete');
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = 'development';
    try {
      const invited = await reviews.invite(
        submissionId,
        chiefId,
        {
          reviewerId,
          reviewFormId,
          responseDeadline: new Date(Date.now() + 7 * 86_400_000),
          reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
        },
        'decision-' + suffix,
      );
      expect(typeof invited).toBe('object');
      if (typeof invited !== 'string')
        expect(invited.round.submissionVersionId).toBe(versions[1]?.id);
    } finally {
      process.env.APP_ENV = previous;
    }
  });

  it('freezes the accepted version for a configured no-external-review article type', async () => {
    const articleType = await database.articleType.findFirstOrThrow({
      where: { journalId, slug: 'editorial' },
    });
    const submission = await database.submission.create({
      data: {
        journalId,
        submitterId: authorId,
        articleTypeId: articleType.id,
        state: 'EDITOR_ASSIGNED',
        title: 'Editorial tanpa peer review eksternal',
        abstract:
          'Abstrak editorial fiktif yang dinilai langsung oleh editor sesuai konfigurasi jenis artikel.',
        submittedAt: new Date(),
        editorialAssignments: {
          create: {
            journalId,
            editorId: chiefId,
            assignedById: chiefId,
            assignmentNote: 'Evaluasi editor.',
          },
        },
      },
    });
    submissionIds.push(submission.id);
    const version = await database.submissionVersion.create({
      data: {
        submissionId: submission.id,
        version: 1,
        snapshot: { title: submission.title, files: [] },
      },
    });
    const accepted = await decisions.decide(
      submission.id,
      chiefId,
      {
        type: 'ACCEPT',
        reason: 'Editorial memenuhi ruang lingkup dan standar jurnal.',
        subject: 'Naskah diterima',
        body: 'Naskah editorial diterima dan akan diteruskan ke tahap produksi jurnal.',
        responseRequired: false,
        releaseResponseIds: [],
        releaseReviewFileIds: [],
      },
      'decision-' + suffix,
    );
    expect(typeof accepted).toBe('object');
    expect(
      await database.submission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({ state: 'ACCEPTED', acceptedVersionId: version.id });
  });
});
