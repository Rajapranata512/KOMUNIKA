import { randomUUID } from 'node:crypto';

import { database, Prisma } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReviewService } from '../src/modules/reviews/review.service.js';
import { SubmissionService } from '../src/modules/submissions/submission.service.js';

describe('tenant-scoped blind peer review integration', () => {
  const suffix = randomUUID();
  const enqueue = vi.fn().mockResolvedValue('queued');
  const scan = vi.fn().mockResolvedValue('queued');
  const reviews = new ReviewService({ enqueue } as never, { enqueue: scan } as never);
  const submissions = new SubmissionService();
  const userIds: string[] = [];
  let journalId = '';
  let submissionId = '';
  let chiefId = '';
  let authorId = '';
  let reviewerId = '';
  let decliningReviewerId = '';
  let expiredReviewerId = '';
  let outsiderId = '';
  let reviewFormId = '';
  let questionId = '';
  let manuscriptFileId = '';
  let coverFileId = '';
  let invitationId = '';
  let invitationToken = '';
  let assignmentId = '';

  beforeAll(async () => {
    const passwordHash = await hash(`Review-${suffix}`);
    const users = await Promise.all(
      ['chief', 'author', 'reviewer', 'declining', 'expired', 'outsider'].map((name) =>
        database.user.create({
          data: {
            email: `review-${name}-${suffix}@aksara.local`,
            passwordHash,
            fullName: `User ${name}`,
            affiliation: `Institute ${name}`,
            expertise: name.includes('review') ? ['metadata'] : [],
            emailVerifiedAt: new Date(),
          },
        }),
      ),
    );
    [chiefId, authorId, reviewerId, decliningReviewerId, expiredReviewerId, outsiderId] = users.map(
      ({ id }) => id,
    );
    userIds.push(...users.map(({ id }) => id));
    const journal = await database.journal.create({
      data: {
        slug: `review-${suffix}`,
        title: 'Jurnal Review Fiktif',
        abbreviation: 'JRF',
        description: 'Fixture peer review tenant scoped.',
        scope: 'Pengujian invitation, anonymity, deadline, dan review content.',
        contactEmail: users[0]?.email ?? 'chief@example.test',
        reviewModel: 'DOUBLE_ANONYMOUS',
        status: 'PUBLISHED',
        submissionsOpen: true,
        createdById: chiefId,
        memberships: {
          create: [
            { userId: chiefId, role: 'EDITOR_IN_CHIEF' },
            { userId: reviewerId, role: 'REVIEWER' },
            { userId: decliningReviewerId, role: 'REVIEWER' },
            { userId: expiredReviewerId, role: 'REVIEWER' },
          ],
        },
        reviewerProfiles: {
          create: [
            { userId: reviewerId, languages: ['id'], expertise: { create: { value: 'metadata' } } },
            { userId: decliningReviewerId, languages: ['en'] },
            { userId: expiredReviewerId, languages: ['id'] },
          ],
        },
        articleTypes: { create: { slug: 'research', title: 'Artikel penelitian' } },
        reviewForms: {
          create: {
            name: 'Form standar',
            version: 1,
            questions: {
              create: {
                prompt: 'Apakah metode dijelaskan secara memadai?',
                type: 'LONG_TEXT',
                required: true,
                sortOrder: 0,
              },
            },
          },
        },
      },
      include: { articleTypes: true, reviewForms: { include: { questions: true } } },
    });
    journalId = journal.id;
    reviewFormId = journal.reviewForms[0]?.id ?? '';
    questionId = journal.reviewForms[0]?.questions[0]?.id ?? '';
    const articleTypeId = journal.articleTypes[0]?.id;
    if (!articleTypeId || !reviewFormId || !questionId) throw new Error('Review fixtures missing.');
    const submission = await database.submission.create({
      data: {
        journalId,
        submitterId: authorId,
        articleTypeId,
        state: 'EDITOR_ASSIGNED',
        title: 'Naskah Double Blind Fiktif',
        abstract: 'Abstrak untuk pengujian reviewer tanpa kebocoran identitas author.',
        submittedAt: new Date(),
        authors: {
          create: {
            userId: authorId,
            givenName: 'Nama',
            familyName: 'Rahasia',
            email: users[1]?.email ?? '',
            affiliation: 'Afiliasi Rahasia',
            isCorresponding: true,
            sortOrder: 0,
          },
        },
        keywords: { create: { value: 'metadata', sortOrder: 0 } },
        editorialAssignments: {
          create: {
            journalId,
            editorId: chiefId,
            assignedById: chiefId,
            assignmentNote: 'Handle peer review.',
          },
        },
      },
    });
    submissionId = submission.id;
    const [manuscript, cover] = await Promise.all([
      database.storedFile.create({
        data: {
          journalId,
          uploaderId: authorId,
          storageKey: `review/${suffix}/manuscript`,
          originalName: 'Nama-Rahasia-Manuscript.pdf',
          declaredMime: 'application/pdf',
          detectedMime: 'application/pdf',
          size: 100,
          scanStatus: 'CLEAN',
          visibility: 'PRIVATE',
          uploadedAt: new Date(),
          scannedAt: new Date(),
        },
      }),
      database.storedFile.create({
        data: {
          journalId,
          uploaderId: authorId,
          storageKey: `review/${suffix}/cover`,
          originalName: 'Cover-Letter-Identitas.pdf',
          declaredMime: 'application/pdf',
          detectedMime: 'application/pdf',
          size: 50,
          scanStatus: 'CLEAN',
          visibility: 'PRIVATE',
          uploadedAt: new Date(),
          scannedAt: new Date(),
        },
      }),
    ]);
    manuscriptFileId = manuscript.id;
    coverFileId = cover.id;
    await database.submissionFile.createMany({
      data: [
        { submissionId, storedFileId: manuscript.id, purpose: 'MANUSCRIPT', sortOrder: 0 },
        { submissionId, storedFileId: cover.id, purpose: 'COVER_LETTER', sortOrder: 1 },
      ],
    });
    await database.submissionVersion.create({
      data: {
        submissionId,
        version: 1,
        snapshot: {
          title: submission.title,
          authors: [{ givenName: 'Nama', familyName: 'Rahasia' }],
          files: [
            { purpose: 'MANUSCRIPT', fileId: manuscript.id, originalName: manuscript.originalName },
            { purpose: 'COVER_LETTER', fileId: cover.id, originalName: cover.originalName },
          ],
        } as Prisma.InputJsonValue,
      },
    });
  });

  afterAll(async () => {
    await database.reviewAnswer.deleteMany({
      where: { response: { assignment: { round: { submissionId } } } },
    });
    await database.reviewFile.deleteMany({
      where: { response: { assignment: { round: { submissionId } } } },
    });
    await database.reviewResponse.deleteMany({
      where: { assignment: { round: { submissionId } } },
    });
    await database.reviewAssignment.deleteMany({ where: { round: { submissionId } } });
    await database.reviewInvitation.deleteMany({ where: { round: { submissionId } } });
    await database.reviewRound.deleteMany({ where: { submissionId } });
    await database.editorialAssignment.deleteMany({ where: { submissionId } });
    await database.submissionTimelineEvent.deleteMany({ where: { submissionId } });
    await database.submissionVersion.deleteMany({ where: { submissionId } });
    await database.submissionFile.deleteMany({ where: { submissionId } });
    await database.submissionAuthor.deleteMany({ where: { submissionId } });
    await database.submissionKeyword.deleteMany({ where: { submissionId } });
    await database.submission.deleteMany({ where: { id: submissionId } });
    await database.storedFile.deleteMany({
      where: { id: { in: [manuscriptFileId, coverFileId].filter(Boolean) } },
    });
    await database.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await database.journal.deleteMany({ where: { id: journalId } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });

  it('limits the directory and creates a hashed single-use invitation for the assigned version', async () => {
    const directory = await reviews.directory(submissionId, chiefId, 'metadata');
    expect(directory?.map(({ id }) => id)).toContain(reviewerId);
    await expect(reviews.directory(submissionId, outsiderId)).resolves.toBeNull();
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = 'development';
    try {
      const result = await reviews.invite(
        submissionId,
        chiefId,
        {
          reviewerId,
          reviewFormId,
          responseDeadline: new Date(Date.now() + 7 * 86_400_000),
          reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
        },
        `review-${suffix}`,
      );
      expect(typeof result).toBe('object');
      if (typeof result === 'string') return;
      invitationId = result.invitation.id;
      invitationToken = result.token ?? '';
      expect(invitationToken).toHaveLength(43);
    } finally {
      process.env.APP_ENV = previous;
    }
    const stored = await database.reviewInvitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    expect(stored.tokenHash).not.toContain(invitationToken);
    expect(await database.submission.findUnique({ where: { id: submissionId } })).toMatchObject({
      state: 'UNDER_REVIEW',
    });
    expect(await database.storedFile.findUnique({ where: { id: manuscriptFileId } })).toMatchObject(
      { visibility: 'REVIEWER' },
    );
    expect(await database.storedFile.findUnique({ where: { id: coverFileId } })).toMatchObject({
      visibility: 'PRIVATE',
    });
    await expect(
      reviews.invite(
        submissionId,
        chiefId,
        {
          reviewerId,
          reviewFormId,
          responseDeadline: new Date(Date.now() + 7 * 86_400_000),
          reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
        },
        `review-${suffix}`,
      ),
    ).resolves.toBe('invitation-exists');
  });

  it('accepts once and exposes no author identity, original filename, or cover letter in double blind access', async () => {
    const invitation = await reviews.invitation(invitationId, invitationToken, reviewerId);
    expect(invitation).not.toBeNull();
    expect(invitation).not.toHaveProperty('manuscript.authors');
    await expect(reviews.invitation(invitationId, invitationToken, outsiderId)).resolves.toBeNull();
    const accepted = await reviews.respond(
      invitationId,
      invitationToken,
      reviewerId,
      true,
      false,
      '',
      `review-${suffix}`,
    );
    expect(typeof accepted).toBe('object');
    if (typeof accepted === 'string') return;
    assignmentId = accepted.assignmentId ?? '';
    expect(assignmentId).toBeTruthy();
    await expect(
      reviews.respond(
        invitationId,
        invitationToken,
        reviewerId,
        true,
        false,
        '',
        `review-${suffix}`,
      ),
    ).resolves.toBe('not-found');
    const detail = await reviews.assignment(assignmentId, reviewerId);
    expect(detail).not.toHaveProperty('manuscript.authors');
    expect(detail?.files).toHaveLength(1);
    expect(detail?.files[0]?.displayName).toBe('manuscript-file-1.pdf');
    expect(JSON.stringify(detail)).not.toContain('Nama-Rahasia-Manuscript.pdf');
    expect(JSON.stringify(detail)).not.toContain('Cover-Letter-Identitas.pdf');
    await expect(reviews.assignment(assignmentId, outsiderId)).resolves.toBeNull();
  });

  it('rotates pending reminder tokens and denies declined or expired invitations', async () => {
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = 'development';
    try {
      const declining = await reviews.invite(
        submissionId,
        chiefId,
        {
          reviewerId: decliningReviewerId,
          reviewFormId,
          responseDeadline: new Date(Date.now() + 7 * 86_400_000),
          reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
        },
        `review-${suffix}`,
      );
      expect(typeof declining).toBe('object');
      if (typeof declining === 'string') return;
      const oldToken = declining.token ?? '';
      const oldHash = declining.invitation.tokenHash;
      await expect(
        reviews.remind(declining.invitation.id, chiefId, `review-${suffix}`),
      ).resolves.toBe('sent');
      await expect(
        reviews.remind(declining.invitation.id, chiefId, `review-${suffix}`),
      ).resolves.toBe('too-soon');
      await expect(
        reviews.invitation(declining.invitation.id, oldToken, decliningReviewerId),
      ).resolves.toBeNull();
      const reminderCall = enqueue.mock.calls.find(
        ([payload]) =>
          payload.event === 'peer-review.invitation-reminder' &&
          payload.invitationId === declining.invitation.id,
      );
      const replacementToken = reminderCall?.[0].token as string | undefined;
      expect(replacementToken).toHaveLength(43);
      expect(
        (
          await database.reviewInvitation.findUniqueOrThrow({
            where: { id: declining.invitation.id },
          })
        ).tokenHash,
      ).not.toBe(oldHash);
      await expect(
        reviews.respond(
          declining.invitation.id,
          replacementToken ?? '',
          decliningReviewerId,
          false,
          true,
          'Konflik institusi yang sama.',
          `review-${suffix}`,
        ),
      ).resolves.toMatchObject({ accepted: false, assignmentId: null });
      await expect(
        reviews.invitation(declining.invitation.id, replacementToken ?? '', decliningReviewerId),
      ).resolves.toBeNull();

      const expired = await reviews.invite(
        submissionId,
        chiefId,
        {
          reviewerId: expiredReviewerId,
          reviewFormId,
          responseDeadline: new Date(Date.now() + 7 * 86_400_000),
          reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
        },
        `review-${suffix}`,
      );
      expect(typeof expired).toBe('object');
      if (typeof expired === 'string') return;
      await database.reviewInvitation.update({
        where: { id: expired.invitation.id },
        data: { responseDeadline: new Date(Date.now() - 1_000) },
      });
      await expect(
        reviews.respond(
          expired.invitation.id,
          expired.token ?? '',
          expiredReviewerId,
          true,
          false,
          '',
          `review-${suffix}`,
        ),
      ).resolves.toBe('expired');
      expect(
        await database.reviewInvitation.findUniqueOrThrow({
          where: { id: expired.invitation.id },
        }),
      ).toMatchObject({ status: 'EXPIRED', tokenUsedAt: expect.any(Date) });
      expect(
        await database.reviewAssignment.count({
          where: { invitationId: expired.invitation.id },
        }),
      ).toBe(0);
    } finally {
      process.env.APP_ENV = previous;
    }
  });

  it('separates confidential content, validates required answers, and locks the submitted recommendation', async () => {
    await expect(
      reviews.save(
        assignmentId,
        reviewerId,
        { commentsToAuthor: 'Terlalu singkat', confidentialComments: 'Rahasia', answers: [] },
        true,
        `review-${suffix}`,
      ),
    ).resolves.toBe('incomplete');
    const draft = await reviews.save(
      assignmentId,
      reviewerId,
      {
        commentsToAuthor: 'Komentar konstruktif untuk penulis yang cukup panjang.',
        confidentialComments: 'Komentar rahasia hanya untuk editor.',
        recommendation: 'MINOR_REVISION',
        answers: [{ questionId, value: 'Metode cukup jelas tetapi butuh rincian.' }],
      },
      false,
      `review-${suffix}`,
    );
    expect(typeof draft).toBe('object');
    const submitted = await reviews.save(
      assignmentId,
      reviewerId,
      {
        commentsToAuthor: 'Komentar konstruktif untuk penulis yang cukup panjang.',
        confidentialComments: 'Komentar rahasia hanya untuk editor.',
        recommendation: 'MINOR_REVISION',
        answers: [{ questionId, value: 'Metode cukup jelas tetapi butuh rincian.' }],
      },
      true,
      `review-${suffix}`,
    );
    expect(typeof submitted).toBe('object');
    const rounds = await reviews.editorRounds(submissionId, chiefId);
    expect(rounds?.[0]?.invitations[0]?.assignment?.response).toMatchObject({
      status: 'SUBMITTED',
      recommendation: 'MINOR_REVISION',
      confidentialComments: 'Komentar rahasia hanya untuk editor.',
    });
    const authorDetail = await submissions.getForAuthor(submissionId, authorId);
    expect(authorDetail).not.toHaveProperty('reviewRounds');
    expect(JSON.stringify(authorDetail)).not.toContain('Komentar rahasia hanya untuk editor.');
    await expect(
      reviews.save(
        assignmentId,
        reviewerId,
        {
          commentsToAuthor: 'Perubahan setelah lock tidak diizinkan.',
          confidentialComments: '',
          recommendation: 'ACCEPT',
          answers: [{ questionId, value: 'ok' }],
        },
        false,
        `review-${suffix}`,
      ),
    ).resolves.toBe('forbidden');
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'peer-review.submitted', assignmentId }),
      expect.any(String),
    );
  });
});
