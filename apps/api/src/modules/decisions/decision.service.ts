import { createHash } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { database, Prisma } from '@aksara/database';
import { canTransitionSubmission, createApiError } from '@aksara/domain';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';

export interface EditorialDecisionInput {
  type: 'REJECT' | 'MAJOR_REVISION' | 'MINOR_REVISION' | 'ACCEPT';
  reason: string;
  subject: string;
  body: string;
  revisionDueAt?: Date;
  responseRequired: boolean;
  evaluationMode?: 'EXTERNAL_REVIEW' | 'EDITOR_ONLY';
  releaseResponseIds: string[];
  releaseReviewFileIds: string[];
}

const revisionTypes = new Set(['MAJOR_REVISION', 'MINOR_REVISION']);

@Injectable()
export class DecisionService {
  private client: S3Client | undefined;

  constructor(private readonly emails: TransactionalEmailQueue) {}

  private async editorAccess(submissionId: string, userId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        journalId: true,
        state: true,
        articleType: { select: { peerReviewRequired: true } },
        revisions: {
          where: { submittedAt: { not: null } },
          orderBy: { submittedAt: 'desc' },
          select: { decision: { select: { evaluationMode: true } } },
          take: 1,
        },
        submitter: { select: { id: true, email: true } },
        journal: { select: { title: true } },
        editorialAssignments: {
          where: { editorId: userId, active: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!submission) return null;
    const roles = await database.journalMembership.findMany({
      where: {
        journalId: submission.journalId,
        userId,
        role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] },
      },
      select: { role: true },
    });
    const isChief = roles.some(({ role }) => role === 'EDITOR_IN_CHIEF');
    const isAssignedSectionEditor =
      roles.some(({ role }) => role === 'SECTION_EDITOR') &&
      submission.editorialAssignments.length > 0;
    return isChief || isAssignedSectionEditor ? submission : null;
  }

  async context(submissionId: string, actorId: string) {
    const access = await this.editorAccess(submissionId, actorId);
    if (!access) return null;
    const [version, round, templates, revision] = await Promise.all([
      database.submissionVersion.findFirst({
        where: { submissionId },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      }),
      database.reviewRound.findFirst({
        where: { submissionId, closedAt: null },
        orderBy: { sequence: 'desc' },
        include: {
          assignments: {
            where: { response: { status: 'SUBMITTED' } },
            select: {
              reviewer: { select: { id: true, email: true, fullName: true } },
              response: {
                select: {
                  id: true,
                  commentsToAuthor: true,
                  confidentialComments: true,
                  recommendation: true,
                  files: {
                    where: { authorVisible: true, storedFile: { scanStatus: 'CLEAN' } },
                    select: {
                      id: true,
                      storedFile: {
                        select: { id: true, originalName: true, size: true, detectedMime: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      database.journalTemplate.findMany({
        where: {
          journalId: access.journalId,
          isActive: true,
          kind: {
            in: [
              'DECISION_REJECT',
              'DECISION_MAJOR_REVISION',
              'DECISION_MINOR_REVISION',
              'DECISION_ACCEPT',
            ],
          },
        },
        select: { id: true, kind: true, title: true, body: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      }),
      database.revision.findFirst({
        where: { submissionId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          dueAt: true,
          submittedAt: true,
          responseRequired: true,
          responseText: true,
          reminderCount: true,
          lastReminderAt: true,
          decision: { select: { evaluationMode: true } },
          submittedVersion: { select: { id: true, version: true } },
        },
      }),
    ]);
    return { state: access.state, journal: access.journal, version, round, templates, revision };
  }

  async decide(
    submissionId: string,
    actorId: string,
    input: EditorialDecisionInput,
    requestId: string,
  ) {
    const access = await this.editorAccess(submissionId, actorId);
    if (!access) return 'forbidden' as const;
    if (!['EDITOR_ASSIGNED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(access.state))
      return 'state-conflict' as const;
    if (
      (access.state === 'EDITOR_ASSIGNED' && access.articleType.peerReviewRequired) ||
      (access.state === 'RESUBMITTED' &&
        access.revisions[0]?.decision.evaluationMode === 'EXTERNAL_REVIEW')
    )
      return 'review-incomplete' as const;
    const isRevision = revisionTypes.has(input.type);
    if (
      isRevision &&
      (!input.revisionDueAt || input.revisionDueAt <= new Date() || !input.evaluationMode)
    )
      return 'revision-invalid' as const;
    if (!isRevision && (input.revisionDueAt || input.evaluationMode))
      return 'revision-invalid' as const;

    const [targetVersion, round] = await Promise.all([
      database.submissionVersion.findFirst({
        where: { submissionId },
        orderBy: { version: 'desc' },
      }),
      database.reviewRound.findFirst({
        where: { submissionId, closedAt: null },
        orderBy: { sequence: 'desc' },
        include: {
          assignments: {
            where: { response: { status: 'SUBMITTED' } },
            select: {
              response: {
                select: {
                  id: true,
                  commentsToAuthor: true,
                  files: {
                    where: { authorVisible: true, storedFile: { scanStatus: 'CLEAN' } },
                    select: {
                      id: true,
                      storedFile: { select: { originalName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!targetVersion) return 'version-missing' as const;
    if (access.state === 'UNDER_REVIEW' && (!round || !round.assignments.length))
      return 'review-incomplete' as const;

    const responses =
      round?.assignments.flatMap(({ response }) => (response ? [response] : [])) ?? [];
    const responseById = new Map(responses.map((response) => [response.id, response]));
    const fileById = new Map(
      responses.flatMap((response) => response.files.map((file) => [file.id, file] as const)),
    );
    const uniqueResponseIds = [...new Set(input.releaseResponseIds)];
    const uniqueFileIds = [...new Set(input.releaseReviewFileIds)];
    if (
      uniqueResponseIds.some((id) => !responseById.has(id)) ||
      uniqueFileIds.some((id) => !fileById.has(id))
    )
      return 'release-invalid' as const;

    const resultingState =
      input.type === 'REJECT'
        ? ('REJECTED' as const)
        : input.type === 'ACCEPT'
          ? ('ACCEPTED' as const)
          : ('REVISION_REQUIRED' as const);
    if (!canTransitionSubmission(access.state, resultingState)) return 'state-conflict' as const;
    const now = new Date();

    let decision:
      Prisma.EditorialDecisionGetPayload<{ include: { letter: true; revision: true } }> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        decision = await database.$transaction(
          async (transaction) => {
            const transitioned = await transaction.submission.updateMany({
              where: { id: submissionId, state: access.state },
              data: {
                state: resultingState,
                ...(resultingState === 'ACCEPTED' ? { acceptedVersionId: targetVersion.id } : {}),
              },
            });
            if (transitioned.count !== 1) throw new Error('EDITORIAL_DECISION_RACE');
            const created = await transaction.editorialDecision.create({
              data: {
                journalId: access.journalId,
                submissionId,
                actorId,
                reviewRoundId: round?.id,
                targetVersionId: targetVersion.id,
                type: input.type,
                reason: input.reason,
                resultingState,
                revisionDueAt: isRevision ? input.revisionDueAt : null,
                responseRequired: isRevision ? input.responseRequired : false,
                evaluationMode: isRevision ? input.evaluationMode : null,
                letter: { create: { subject: input.subject, body: input.body } },
                reviewReleases: {
                  create: uniqueResponseIds.map((id) => ({
                    reviewResponseId: id,
                    commentsToAuthorSnapshot: responseById.get(id)?.commentsToAuthor ?? '',
                  })),
                },
                fileReleases: {
                  create: uniqueFileIds.map((id) => ({
                    reviewFileId: id,
                    originalNameSnapshot:
                      fileById.get(id)?.storedFile.originalName ?? 'review-file',
                  })),
                },
                ...(isRevision
                  ? {
                      revision: {
                        create: {
                          journalId: access.journalId,
                          submissionId,
                          baseVersionId: targetVersion.id,
                          responseRequired: input.responseRequired,
                          dueAt: input.revisionDueAt as Date,
                        },
                      },
                    }
                  : {}),
              },
              include: { letter: true, revision: true },
            });
            if (round) {
              await transaction.reviewRound.update({
                where: { id: round.id },
                data: { closedAt: now },
              });
              await transaction.reviewAssignment.updateMany({
                where: { roundId: round.id, active: true },
                data: { active: false },
              });
              await transaction.reviewInvitation.updateMany({
                where: { roundId: round.id, status: 'PENDING' },
                data: { status: 'CANCELLED', tokenUsedAt: now },
              });
            }
            await transaction.submissionTimelineEvent.create({
              data: {
                submissionId,
                actorId,
                state: resultingState,
                action: 'editorial.decision_released',
                description:
                  resultingState === 'REVISION_REQUIRED'
                    ? 'Keputusan revisi dan komentar yang disetujui telah dirilis.'
                    : resultingState === 'ACCEPTED'
                      ? 'Naskah telah diterima untuk masuk ke tahap produksi.'
                      : 'Keputusan akhir editorial telah dirilis.',
                visibleToAuthor: true,
              },
            });
            await transaction.auditEvent.create({
              data: {
                actorId,
                action: 'editorial.decision_released',
                targetType: 'EditorialDecision',
                targetId: created.id,
                requestId,
                metadata: {
                  journalId: access.journalId,
                  submissionId,
                  targetVersionId: targetVersion.id,
                  roundId: round?.id ?? null,
                  type: input.type,
                  releasedResponseCount: uniqueResponseIds.length,
                  releasedFileCount: uniqueFileIds.length,
                },
              },
            });
            return created;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 2
        )
          throw error;
      }
    }
    if (!decision) throw new Error('EDITORIAL_DECISION_RETRY_EXHAUSTED');
    await this.emails.enqueue(
      {
        event: 'editorial.decision-released',
        recipient: access.submitter.email,
        userId: access.submitter.id,
        submissionId,
        requestId,
        requestedAt: now.toISOString(),
      },
      decision.id,
    );
    return decision;
  }

  async saveRevision(
    revisionId: string,
    authorId: string,
    responseText: string,
    requestId: string,
  ) {
    const revision = await database.revision.findFirst({
      where: {
        id: revisionId,
        submittedAt: null,
        submission: { submitterId: authorId, state: 'REVISION_REQUIRED' },
      },
      select: { id: true, journalId: true, submissionId: true },
    });
    if (!revision) return null;
    const updated = await database.revision.update({
      where: { id: revision.id },
      data: { responseText },
    });
    await database.auditEvent.create({
      data: {
        actorId: authorId,
        action: 'revision.draft_saved',
        targetType: 'Revision',
        targetId: revision.id,
        requestId,
        metadata: { journalId: revision.journalId, submissionId: revision.submissionId },
      },
    });
    return updated;
  }

  async finalizeRevision(
    revisionId: string,
    authorId: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    const finalizationKey = createHash('sha256').update(idempotencyKey).digest('hex');
    const existing = await database.revision.findUnique({
      where: { finalizationKey },
      select: { id: true, submission: { select: { submitterId: true } } },
    });
    if (existing)
      return existing.id === revisionId && existing.submission.submitterId === authorId
        ? database.revision.findUnique({ where: { id: revisionId } })
        : ('idempotency-conflict' as const);
    const revision = await database.revision.findFirst({
      where: {
        id: revisionId,
        submittedAt: null,
        submission: { submitterId: authorId, state: 'REVISION_REQUIRED' },
      },
      include: {
        baseVersion: true,
        files: {
          include: { storedFile: true },
          orderBy: [{ purpose: 'asc' }, { sortOrder: 'asc' }],
        },
        submission: {
          select: {
            id: true,
            journalId: true,
            submitterId: true,
            versions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!revision) return null;
    const errors: string[] = [];
    if (
      !revision.files.some(
        ({ purpose, storedFile }) => purpose === 'MANUSCRIPT' && storedFile.scanStatus === 'CLEAN',
      )
    )
      errors.push('CLEAN_REVISED_MANUSCRIPT_REQUIRED');
    if (revision.files.some(({ storedFile }) => storedFile.scanStatus !== 'CLEAN'))
      errors.push('REVISION_FILE_SCAN_PENDING_OR_REJECTED');
    if (
      revision.responseRequired &&
      (revision.responseText.trim().length < 20 ||
        !revision.files.some(
          ({ purpose, storedFile }) => purpose === 'RESPONSE' && storedFile.scanStatus === 'CLEAN',
        ))
    )
      errors.push('RESPONSE_TO_REVIEWERS_REQUIRED');
    if (errors.length) return { validationErrors: errors };
    const nextVersion = (revision.submission.versions[0]?.version ?? 0) + 1;
    const now = new Date();
    const base =
      revision.baseVersion.snapshot &&
      typeof revision.baseVersion.snapshot === 'object' &&
      !Array.isArray(revision.baseVersion.snapshot)
        ? (revision.baseVersion.snapshot as Record<string, Prisma.JsonValue>)
        : {};
    const snapshot = {
      ...base,
      previousVersionId: revision.baseVersionId,
      revisionId: revision.id,
      responseToReviewers: revision.responseText,
      files: revision.files.map(({ purpose, storedFile }) => ({
        purpose,
        fileId: storedFile.id,
        originalName: storedFile.originalName,
        detectedMime: storedFile.detectedMime,
        size: storedFile.size,
        checksumSha256: storedFile.checksumSha256,
      })),
      submittedAt: now.toISOString(),
    };
    const result = await database.$transaction(
      async (transaction) => {
        const transitioned = await transaction.submission.updateMany({
          where: { id: revision.submissionId, submitterId: authorId, state: 'REVISION_REQUIRED' },
          data: { state: 'RESUBMITTED' },
        });
        if (transitioned.count !== 1) throw new Error('REVISION_FINALIZATION_RACE');
        const version = await transaction.submissionVersion.create({
          data: {
            submissionId: revision.submissionId,
            version: nextVersion,
            snapshot: snapshot as Prisma.InputJsonValue,
          },
        });
        const updated = await transaction.revision.update({
          where: { id: revision.id },
          data: { submittedVersionId: version.id, submittedAt: now, finalizationKey },
        });
        await transaction.submissionTimelineEvent.create({
          data: {
            submissionId: revision.submissionId,
            actorId: authorId,
            state: 'RESUBMITTED',
            action: 'revision.submitted',
            description: 'Revisi versi ' + nextVersion + ' dikirim ke tim editorial.',
            visibleToAuthor: true,
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: authorId,
            action: 'revision.submitted',
            targetType: 'Revision',
            targetId: revision.id,
            requestId,
            metadata: {
              journalId: revision.journalId,
              submissionId: revision.submissionId,
              version: nextVersion,
              overdue: now > revision.dueAt,
            },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const editor = await database.editorialAssignment.findFirst({
      where: { submissionId: revision.submissionId, active: true },
      orderBy: { assignedAt: 'desc' },
      select: { editor: { select: { id: true, email: true } } },
    });
    if (editor)
      await this.emails.enqueue(
        {
          event: 'editorial.revision-submitted',
          recipient: editor.editor.email,
          userId: editor.editor.id,
          submissionId: revision.submissionId,
          requestId,
          requestedAt: now.toISOString(),
        },
        revision.id,
      );
    return result;
  }

  async authorizeReleasedFile(
    submissionId: string,
    fileId: string,
    authorId: string,
    requestId: string,
  ) {
    const release = await database.decisionReviewFileRelease.findFirst({
      where: {
        reviewFile: { storedFileId: fileId, storedFile: { scanStatus: 'CLEAN' } },
        decision: { submissionId, submission: { submitterId: authorId } },
      },
      select: {
        originalNameSnapshot: true,
        decision: { select: { journalId: true } },
        reviewFile: { select: { storedFile: { select: { id: true, storageKey: true } } } },
      },
    });
    if (!release) return null;
    const displayName = release.originalNameSnapshot.replace(/[\r\n"\\]/g, '_').slice(0, 180);
    const url = await getSignedUrl(
      this.s3(requestId),
      new GetObjectCommand({
        Bucket: this.privateBucket(requestId),
        Key: release.reviewFile.storedFile.storageKey,
        ResponseContentDisposition: 'attachment; filename="' + displayName + '"',
      }),
      { expiresIn: 300 },
    );
    await database.auditEvent.create({
      data: {
        actorId: authorId,
        action: 'decision.review_file_download_authorized',
        targetType: 'StoredFile',
        targetId: release.reviewFile.storedFile.id,
        requestId,
        metadata: { submissionId, journalId: release.decision.journalId },
      },
    });
    return { url, expiresInSeconds: 300, displayName };
  }

  async remindRevision(revisionId: string, actorId: string, requestId: string) {
    const revision = await database.revision.findUnique({
      where: { id: revisionId },
      include: {
        submission: { select: { id: true, submitter: { select: { id: true, email: true } } } },
      },
    });
    if (!revision || !(await this.editorAccess(revision.submissionId, actorId)))
      return 'forbidden' as const;
    if (revision.submittedAt) return 'state-conflict' as const;
    if (revision.lastReminderAt && revision.lastReminderAt > new Date(Date.now() - 86_400_000))
      return 'too-soon' as const;
    const now = new Date();
    await database.$transaction([
      database.revision.update({
        where: { id: revision.id },
        data: { reminderCount: { increment: 1 }, lastReminderAt: now },
      }),
      database.auditEvent.create({
        data: {
          actorId,
          action: 'revision.reminder_sent',
          targetType: 'Revision',
          targetId: revision.id,
          requestId,
          metadata: {
            journalId: revision.journalId,
            submissionId: revision.submissionId,
            reminderNumber: revision.reminderCount + 1,
          },
        },
      }),
    ]);
    await this.emails.enqueue(
      {
        event: 'editorial.revision-reminder',
        recipient: revision.submission.submitter.email,
        userId: revision.submission.submitter.id,
        submissionId: revision.submissionId,
        requestId,
        requestedAt: now.toISOString(),
      },
      revision.id + '-' + (revision.reminderCount + 1),
    );
    return 'sent' as const;
  }

  private privateBucket(requestId: string) {
    const bucket = process.env.OBJECT_STORAGE_BUCKET_PRIVATE;
    if (!bucket)
      throw new ServiceUnavailableException(
        createApiError(
          'OBJECT_STORAGE_NOT_CONFIGURED',
          'Penyimpanan belum dikonfigurasi.',
          requestId,
        ),
      );
    return bucket;
  }

  private s3(requestId: string) {
    if (this.client) return this.client;
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const region = process.env.OBJECT_STORAGE_REGION;
    const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    if (!endpoint || !region || !accessKeyId || !secretAccessKey)
      throw new ServiceUnavailableException(
        createApiError(
          'OBJECT_STORAGE_NOT_CONFIGURED',
          'Penyimpanan belum dikonfigurasi.',
          requestId,
        ),
      );
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
