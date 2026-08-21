import { createHash, randomBytes } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { database, Prisma } from '@aksara/database';
import { createApiError } from '@aksara/domain';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';
import { FileScanQueue } from '../submissions/file-scan.queue.js';

interface InviteInput {
  reviewerId: string;
  reviewFormId: string;
  responseDeadline: Date;
  reviewDeadline: Date;
}

interface ReviewDraftInput {
  commentsToAuthor: string;
  confidentialComments: string;
  recommendation?: 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT';
  answers: Array<{ questionId: string; value: string }>;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function snapshotObject(snapshot: Prisma.JsonValue) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as Record<string, Prisma.JsonValue>)
    : {};
}

function snapshotFileIds(snapshot: Prisma.JsonValue): string[] {
  const files = snapshotObject(snapshot).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return [];
    const record = file as Record<string, Prisma.JsonValue>;
    const id = record.fileId;
    const purpose = record.purpose;
    return typeof id === 'string' &&
      (purpose === 'MANUSCRIPT' || purpose === 'SUPPLEMENTARY' || purpose === 'RESPONSE')
      ? [id]
      : [];
  });
}

function anonymousFileName(index: number, mime: string | null) {
  const extension =
    mime === 'application/pdf'
      ? 'pdf'
      : mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? 'docx'
        : mime === 'application/vnd.oasis.opendocument.text'
          ? 'odt'
          : mime === 'text/plain'
            ? 'txt'
            : 'bin';
  return `manuscript-file-${index + 1}.${extension}`;
}

@Injectable()
export class ReviewService {
  private client: S3Client | undefined;

  constructor(
    private readonly emails: TransactionalEmailQueue,
    private readonly scans: FileScanQueue,
  ) {}

  private async editorAccess(submissionId: string, userId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        journalId: true,
        editorialAssignments: { where: { active: true, editorId: userId }, select: { id: true } },
        journal: {
          select: {
            memberships: {
              where: { userId, role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] } },
              select: { role: true },
            },
          },
        },
      },
    });
    if (!submission) return null;
    const roles = submission.journal.memberships.map(({ role }) => role);
    if (roles.includes('EDITOR_IN_CHIEF')) return submission;
    return roles.includes('SECTION_EDITOR') && submission.editorialAssignments.length
      ? submission
      : null;
  }

  async directory(submissionId: string, actorId: string, query?: string) {
    const access = await this.editorAccess(submissionId, actorId);
    if (!access) return null;
    const reviewers = await database.journalMembership.findMany({
      where: {
        journalId: access.journalId,
        role: 'REVIEWER',
        user: {
          disabledAt: null,
          emailVerifiedAt: { not: null },
          ...(query
            ? {
                OR: [
                  { fullName: { contains: query, mode: 'insensitive' as const } },
                  { affiliation: { contains: query, mode: 'insensitive' as const } },
                  { expertise: { has: query } },
                ],
              }
            : {}),
        },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            affiliation: true,
            expertise: true,
            locale: true,
            reviewerProfiles: {
              where: { journalId: access.journalId },
              select: {
                languages: true,
                availability: true,
                maxActiveAssignments: true,
                biography: true,
                expertise: { select: { value: true }, orderBy: { value: 'asc' } },
              },
            },
            reviewAssignments: {
              where: { active: true, lockedAt: null },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { user: { fullName: 'asc' } },
      take: 100,
    });
    return reviewers.map(({ user }) => {
      const profile = user.reviewerProfiles[0];
      const capacity = profile?.maxActiveAssignments ?? 3;
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        affiliation: user.affiliation,
        expertise: profile?.expertise.map(({ value }) => value) ?? user.expertise,
        languages: profile?.languages ?? [user.locale],
        availability: profile?.availability ?? 'AVAILABLE',
        biography: profile?.biography ?? '',
        activeAssignments: user.reviewAssignments.length,
        capacity,
        canAccept:
          (profile?.availability ?? 'AVAILABLE') !== 'UNAVAILABLE' &&
          user.reviewAssignments.length < capacity,
      };
    });
  }

  async forms(submissionId: string, actorId: string) {
    const access = await this.editorAccess(submissionId, actorId);
    if (!access) return null;
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: { articleType: { select: { sectionId: true } } },
    });
    return database.reviewForm.findMany({
      where: {
        journalId: access.journalId,
        isActive: true,
        OR: [{ sectionId: null }, { sectionId: submission?.articleType.sectionId ?? undefined }],
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ version: 'desc' }, { name: 'asc' }],
    });
  }

  async invite(submissionId: string, actorId: string, input: InviteInput, requestId: string) {
    const access = await this.editorAccess(submissionId, actorId);
    if (!access) return 'forbidden' as const;
    if (input.responseDeadline <= new Date() || input.reviewDeadline < input.responseDeadline)
      return 'deadline-invalid' as const;
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        articleType: { select: { sectionId: true, peerReviewRequired: true } },
        revisions: {
          where: { submittedAt: { not: null } },
          orderBy: { submittedAt: 'desc' },
          select: { decision: { select: { evaluationMode: true } } },
          take: 1,
        },
      },
    });
    if (
      !submission ||
      !['EDITOR_ASSIGNED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(submission.state)
    )
      return 'state-conflict' as const;
    if (
      submission.state === 'RESUBMITTED' &&
      submission.revisions[0]?.decision.evaluationMode !== 'EXTERNAL_REVIEW'
    )
      return 'state-conflict' as const;
    const version = submission.versions[0];
    if (!version || !submission.articleType.peerReviewRequired) return 'version-missing' as const;
    const [reviewer, form] = await Promise.all([
      database.user.findFirst({
        where: {
          id: input.reviewerId,
          disabledAt: null,
          emailVerifiedAt: { not: null },
          journalMemberships: { some: { journalId: submission.journalId, role: 'REVIEWER' } },
        },
        include: {
          reviewerProfiles: { where: { journalId: submission.journalId } },
          reviewAssignments: { where: { active: true, lockedAt: null }, select: { id: true } },
        },
      }),
      database.reviewForm.findFirst({
        where: {
          id: input.reviewFormId,
          journalId: submission.journalId,
          isActive: true,
          OR: [{ sectionId: null }, { sectionId: submission.articleType.sectionId ?? undefined }],
        },
      }),
    ]);
    if (!reviewer || !form) return 'reviewer-or-form-invalid' as const;
    const profile = reviewer.reviewerProfiles[0];
    if (
      profile?.availability === 'UNAVAILABLE' ||
      reviewer.reviewAssignments.length >= (profile?.maxActiveAssignments ?? 3)
    )
      return 'reviewer-unavailable' as const;
    const openRound = await database.reviewRound.findFirst({
      where: { submissionId, closedAt: null },
      orderBy: { sequence: 'desc' },
      select: {
        id: true,
        reviewFormId: true,
        submissionVersionId: true,
        invitations: { where: { reviewerId: reviewer.id }, select: { id: true }, take: 1 },
      },
    });
    if (
      openRound &&
      (openRound.reviewFormId !== form.id || openRound.submissionVersionId !== version.id)
    )
      return 'round-conflict' as const;
    if (openRound?.invitations.length) return 'invitation-exists' as const;

    const token = randomBytes(32).toString('base64url');
    let result;
    try {
      result = await database.$transaction(
        async (transaction) => {
          let round = await transaction.reviewRound.findFirst({
            where: { submissionId, closedAt: null },
            orderBy: { sequence: 'desc' },
          });
          if (!round) {
            const latest = await transaction.reviewRound.findFirst({
              where: { submissionId },
              orderBy: { sequence: 'desc' },
              select: { sequence: true },
            });
            round = await transaction.reviewRound.create({
              data: {
                journalId: submission.journalId,
                submissionId,
                submissionVersionId: version.id,
                reviewFormId: form.id,
                assignedEditorId: actorId,
                sequence: (latest?.sequence ?? 0) + 1,
              },
            });
          }
          const invitation = await transaction.reviewInvitation.create({
            data: {
              journalId: submission.journalId,
              roundId: round.id,
              reviewerId: reviewer.id,
              invitedById: actorId,
              tokenHash: digest(token),
              responseDeadline: input.responseDeadline,
              reviewDeadline: input.reviewDeadline,
            },
          });
          if (submission.state !== 'UNDER_REVIEW')
            await transaction.submission.update({
              where: { id: submissionId },
              data: { state: 'UNDER_REVIEW' },
            });
          const fileIds = snapshotFileIds(version.snapshot);
          await transaction.storedFile.updateMany({
            where: { id: { in: fileIds }, journalId: submission.journalId, scanStatus: 'CLEAN' },
            data: { visibility: 'REVIEWER' },
          });
          await transaction.submissionTimelineEvent.create({
            data: {
              submissionId,
              actorId,
              state: 'UNDER_REVIEW',
              action: 'review.invited',
              description: 'Reviewer diundang untuk round aktif.',
              visibleToAuthor: false,
            },
          });
          await transaction.auditEvent.create({
            data: {
              actorId,
              action: 'review.invited',
              targetType: 'ReviewInvitation',
              targetId: invitation.id,
              requestId,
              metadata: {
                journalId: submission.journalId,
                submissionId,
                roundId: round.id,
                reviewerId: reviewer.id,
                responseDeadline: input.responseDeadline.toISOString(),
                reviewDeadline: input.reviewDeadline.toISOString(),
              },
            },
          });
          return { invitation, round };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'invitation-exists' as const;
      throw error;
    }
    await this.emails.enqueue(
      {
        event: 'peer-review.invited',
        recipient: reviewer.email,
        userId: reviewer.id,
        invitationId: result.invitation.id,
        token,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      result.invitation.id,
    );
    return { ...result, token: process.env.APP_ENV === 'development' ? token : undefined };
  }

  async invitation(invitationId: string, token: string, reviewerId: string) {
    const invitation = await database.reviewInvitation.findFirst({
      where: { id: invitationId, reviewerId, tokenHash: digest(token), tokenUsedAt: null },
      include: {
        journal: { select: { title: true, reviewModel: true } },
        round: {
          include: {
            submission: {
              select: {
                title: true,
                abstract: true,
                keywords: { orderBy: { sortOrder: 'asc' }, select: { value: true } },
                authors: {
                  orderBy: { sortOrder: 'asc' },
                  select: { givenName: true, familyName: true, affiliation: true },
                },
              },
            },
          },
        },
      },
    });
    if (!invitation) return null;
    if (invitation.status !== 'PENDING' || invitation.responseDeadline <= new Date()) {
      if (invitation.status === 'PENDING')
        await database.reviewInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
      return 'expired' as const;
    }
    return {
      id: invitation.id,
      journal: invitation.journal,
      manuscript: {
        title: invitation.round.submission.title,
        abstract: invitation.round.submission.abstract,
        keywords: invitation.round.submission.keywords.map(({ value }) => value),
        ...(invitation.journal.reviewModel === 'SINGLE_ANONYMOUS'
          ? { authors: invitation.round.submission.authors }
          : {}),
      },
      responseDeadline: invitation.responseDeadline,
      reviewDeadline: invitation.reviewDeadline,
      confidentiality:
        'Gunakan naskah hanya untuk peer review ini. Jangan membagikan isi atau mencoba mengidentifikasi pihak yang disamarkan.',
    };
  }

  async respond(
    invitationId: string,
    token: string,
    reviewerId: string,
    accept: boolean,
    conflict: boolean,
    conflictNote: string,
    requestId: string,
  ) {
    const invitation = await database.reviewInvitation.findFirst({
      where: {
        id: invitationId,
        reviewerId,
        tokenHash: digest(token),
        tokenUsedAt: null,
        status: 'PENDING',
      },
      include: { round: true, invitedBy: { select: { id: true, email: true } } },
    });
    if (!invitation) return 'not-found' as const;
    if (invitation.responseDeadline <= new Date()) {
      const now = new Date();
      await database.$transaction([
        database.reviewInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED', tokenUsedAt: now },
        }),
        database.auditEvent.create({
          data: {
            actorId: reviewerId,
            action: 'review.invitation_expired',
            targetType: 'ReviewInvitation',
            targetId: invitation.id,
            requestId,
            metadata: { journalId: invitation.journalId, roundId: invitation.roundId },
          },
        }),
      ]);
      return 'expired' as const;
    }
    if (accept && conflict) return 'conflict' as const;
    const now = new Date();
    const accepted = accept && !conflict;
    const result = await database.$transaction(async (transaction) => {
      await transaction.reviewInvitation.update({
        where: { id: invitation.id },
        data: {
          status: accepted ? 'ACCEPTED' : 'DECLINED',
          conflictStatus: conflict ? 'CONFLICT_DECLARED' : 'NO_CONFLICT',
          conflictNote,
          respondedAt: now,
          tokenUsedAt: now,
        },
      });
      const assignment = accepted
        ? await transaction.reviewAssignment.create({
            data: {
              roundId: invitation.roundId,
              invitationId: invitation.id,
              reviewerId,
              submissionVersionId: invitation.round.submissionVersionId,
              dueAt: invitation.reviewDeadline,
              response: { create: {} },
            },
          })
        : null;
      await transaction.auditEvent.create({
        data: {
          actorId: reviewerId,
          action: accepted ? 'review.invitation_accepted' : 'review.invitation_declined',
          targetType: 'ReviewInvitation',
          targetId: invitation.id,
          requestId,
          metadata: {
            journalId: invitation.journalId,
            roundId: invitation.roundId,
            conflictStatus: conflict ? 'CONFLICT_DECLARED' : 'NO_CONFLICT',
          },
        },
      });
      return assignment;
    });
    await this.emails.enqueue(
      {
        event: 'peer-review.responded',
        recipient: invitation.invitedBy.email,
        userId: invitation.invitedBy.id,
        assignmentId: result?.id ?? invitation.id,
        requestId,
        requestedAt: now.toISOString(),
      },
      `${invitation.id}-${accepted ? 'accepted' : 'declined'}`,
    );
    return { accepted, assignmentId: result?.id ?? null };
  }

  listForReviewer(reviewerId: string) {
    return database.reviewAssignment.findMany({
      where: { reviewerId },
      select: {
        id: true,
        active: true,
        dueAt: true,
        lockedAt: true,
        response: { select: { status: true, submittedAt: true } },
        round: {
          select: {
            sequence: true,
            submission: { select: { title: true } },
            journal: { select: { title: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async assignment(assignmentId: string, reviewerId: string) {
    const assignment = await database.reviewAssignment.findFirst({
      where: { id: assignmentId, reviewerId, active: true },
      include: {
        response: {
          include: {
            answers: true,
            files: {
              include: {
                storedFile: {
                  select: {
                    id: true,
                    originalName: true,
                    declaredMime: true,
                    detectedMime: true,
                    size: true,
                    scanStatus: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        submissionVersion: true,
        round: {
          include: {
            journal: { select: { title: true, reviewModel: true } },
            reviewForm: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
            submission: {
              select: {
                id: true,
                title: true,
                abstract: true,
                keywords: { orderBy: { sortOrder: 'asc' }, select: { value: true } },
                authors: {
                  orderBy: { sortOrder: 'asc' },
                  select: { givenName: true, familyName: true, affiliation: true },
                },
              },
            },
          },
        },
      },
    });
    if (!assignment || assignment.dueAt <= new Date()) return null;
    const fileIds = snapshotFileIds(assignment.submissionVersion.snapshot);
    const files = await database.storedFile.findMany({
      where: {
        id: { in: fileIds },
        journalId: assignment.round.journalId,
        scanStatus: 'CLEAN',
        visibility: 'REVIEWER',
      },
      select: { id: true, detectedMime: true, declaredMime: true, size: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: assignment.id,
      dueAt: assignment.dueAt,
      lockedAt: assignment.lockedAt,
      round: assignment.round.sequence,
      journal: assignment.round.journal,
      manuscript: {
        id: assignment.round.submission.id,
        title: assignment.round.submission.title,
        abstract: assignment.round.submission.abstract,
        keywords: assignment.round.submission.keywords.map(({ value }) => value),
        ...(assignment.round.journal.reviewModel === 'SINGLE_ANONYMOUS'
          ? { authors: assignment.round.submission.authors }
          : {}),
      },
      form: assignment.round.reviewForm,
      response: assignment.response,
      reviewFiles:
        assignment.response?.files.map(({ id, authorVisible, storedFile }) => ({
          id,
          authorVisible,
          storedFile,
        })) ?? [],
      files: files.map((file, index) => ({
        id: file.id,
        displayName: anonymousFileName(index, file.detectedMime ?? file.declaredMime),
        mime: file.detectedMime ?? file.declaredMime,
        size: file.size,
      })),
    };
  }

  async download(assignmentId: string, fileId: string, reviewerId: string, requestId: string) {
    const detail = await this.assignment(assignmentId, reviewerId);
    const fileIndex = detail?.files.findIndex(({ id }) => id === fileId) ?? -1;
    if (!detail || fileIndex < 0) return null;
    const stored = await database.storedFile.findUnique({
      where: { id: fileId },
      select: { storageKey: true },
    });
    if (!stored) return null;
    const displayName = detail.files[fileIndex]?.displayName ?? 'manuscript-file.bin';
    const url = await getSignedUrl(
      this.s3(requestId),
      new GetObjectCommand({
        Bucket: this.privateBucket(requestId),
        Key: stored.storageKey,
        ResponseContentDisposition: `attachment; filename="${displayName}"`,
      }),
      { expiresIn: 300 },
    );
    await database.auditEvent.create({
      data: {
        actorId: reviewerId,
        action: 'review.file_download_authorized',
        targetType: 'StoredFile',
        targetId: fileId,
        requestId,
        metadata: { assignmentId },
      },
    });
    return { url, expiresInSeconds: 300, displayName };
  }

  async save(
    assignmentId: string,
    reviewerId: string,
    input: ReviewDraftInput,
    submit: boolean,
    requestId: string,
  ) {
    const detail = await this.assignment(assignmentId, reviewerId);
    if (!detail || detail.lockedAt || detail.response?.status === 'SUBMITTED')
      return 'forbidden' as const;
    const questionIds = new Set(detail.form.questions.map(({ id }) => id));
    if (input.answers.some(({ questionId }) => !questionIds.has(questionId)))
      return 'answer-invalid' as const;
    if (submit) {
      const answers = new Map(
        input.answers.map(({ questionId, value }) => [questionId, value.trim()]),
      );
      if (
        !input.recommendation ||
        input.commentsToAuthor.trim().length < 20 ||
        detail.form.questions.some((question) => question.required && !answers.get(question.id))
      )
        return 'incomplete' as const;
    }
    const now = new Date();
    const response = await database.$transaction(async (transaction) => {
      const updated = await transaction.reviewResponse.update({
        where: { assignmentId },
        data: {
          commentsToAuthor: input.commentsToAuthor,
          confidentialComments: input.confidentialComments,
          recommendation: input.recommendation,
          ...(submit ? { status: 'SUBMITTED', submittedAt: now } : {}),
          answers: {
            deleteMany: {},
            create: input.answers.map((answer) => ({
              questionId: answer.questionId,
              value: answer.value,
            })),
          },
        },
      });
      if (submit) {
        await transaction.reviewAssignment.update({
          where: { id: assignmentId },
          data: { lockedAt: now },
        });
        await transaction.submissionTimelineEvent.create({
          data: {
            submissionId: detail.manuscript.id,
            actorId: reviewerId,
            state: 'UNDER_REVIEW',
            action: 'review.submitted',
            description: 'Reviewer menyelesaikan review.',
            visibleToAuthor: false,
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: reviewerId,
            action: 'review.submitted',
            targetType: 'ReviewResponse',
            targetId: updated.id,
            requestId,
            metadata: { assignmentId, round: detail.round, recommendation: input.recommendation },
          },
        });
      }
      return updated;
    });
    if (submit) {
      const round = await database.reviewRound.findFirstOrThrow({
        where: { assignments: { some: { id: assignmentId } } },
        select: { assignedEditor: { select: { id: true, email: true } } },
      });
      await this.emails.enqueue(
        {
          event: 'peer-review.submitted',
          recipient: round.assignedEditor.email,
          userId: round.assignedEditor.id,
          assignmentId,
          requestId,
          requestedAt: now.toISOString(),
        },
        assignmentId,
      );
    }
    return response;
  }

  async authorizeFile(
    assignmentId: string,
    reviewerId: string,
    input: { originalName: string; declaredMime: string; size: number; authorVisible: boolean },
    requestId: string,
  ) {
    const assignment = await database.reviewAssignment.findFirst({
      where: {
        id: assignmentId,
        reviewerId,
        active: true,
        lockedAt: null,
        dueAt: { gt: new Date() },
        response: { status: 'DRAFT' },
      },
      select: {
        id: true,
        round: { select: { journalId: true } },
        response: { select: { id: true } },
      },
    });
    if (!assignment?.response) return null;
    const responseId = assignment.response.id;
    const allowed = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]);
    if (input.size < 1 || input.size > 25 * 1024 * 1024 || !allowed.has(input.declaredMime))
      return 'invalid-file' as const;
    const storageKey = [
      'journals',
      assignment.round.journalId,
      'reviews',
      assignment.id,
      randomBytes(16).toString('hex'),
    ].join('/');
    const uploadUrl = await getSignedUrl(
      this.s3(requestId),
      new PutObjectCommand({
        Bucket: this.privateBucket(requestId),
        Key: storageKey,
        ContentType: input.declaredMime,
        ContentLength: input.size,
      }),
      { expiresIn: 600 },
    );
    const file = await database.$transaction(async (transaction) => {
      const stored = await transaction.storedFile.create({
        data: {
          journalId: assignment.round.journalId,
          uploaderId: reviewerId,
          storageKey,
          originalName: input.originalName,
          declaredMime: input.declaredMime,
          size: input.size,
          visibility: 'EDITORIAL_TEAM',
        },
      });
      await transaction.reviewFile.create({
        data: {
          responseId,
          storedFileId: stored.id,
          authorVisible: input.authorVisible,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: reviewerId,
          action: 'review.file_upload_authorized',
          targetType: 'StoredFile',
          targetId: stored.id,
          requestId,
          metadata: {
            assignmentId,
            journalId: assignment.round.journalId,
            size: input.size,
            authorVisible: input.authorVisible,
          },
        },
      });
      return stored;
    });
    return {
      fileId: file.id,
      uploadUrl,
      expiresInSeconds: 600,
      requiredHeaders: { 'content-type': input.declaredMime },
    };
  }

  async completeFile(assignmentId: string, fileId: string, reviewerId: string, requestId: string) {
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: reviewerId,
        scanStatus: 'AWAITING_UPLOAD',
        reviewFile: {
          response: {
            assignment: {
              id: assignmentId,
              reviewerId,
              active: true,
              lockedAt: null,
              dueAt: { gt: new Date() },
            },
          },
        },
      },
      select: { id: true, journalId: true, storageKey: true, size: true, declaredMime: true },
    });
    if (!file) return null;
    let head;
    try {
      head = await this.s3(requestId).send(
        new HeadObjectCommand({ Bucket: this.privateBucket(requestId), Key: file.storageKey }),
      );
    } catch {
      return 'upload-not-found' as const;
    }
    if (head.ContentLength !== file.size || head.ContentType !== file.declaredMime) {
      await database.storedFile.update({
        where: { id: file.id },
        data: { scanStatus: 'REJECTED', uploadedAt: new Date() },
      });
      return 'metadata-mismatch' as const;
    }
    const now = new Date();
    await database.$transaction([
      database.storedFile.update({
        where: { id: file.id },
        data: { scanStatus: 'QUARANTINED', uploadedAt: now },
      }),
      database.auditEvent.create({
        data: {
          actorId: reviewerId,
          action: 'review.file_quarantined',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId,
          metadata: { assignmentId, journalId: file.journalId },
        },
      }),
    ]);
    const scanQueueState = await this.scans.enqueue({
      fileId: file.id,
      journalId: file.journalId,
      requestId,
      requestedAt: now.toISOString(),
    });
    return { fileId: file.id, scanStatus: 'QUARANTINED' as const, scanQueueState };
  }

  async removeFile(assignmentId: string, fileId: string, reviewerId: string, requestId: string) {
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: reviewerId,
        reviewFile: { response: { assignment: { id: assignmentId, reviewerId, lockedAt: null } } },
      },
      select: { id: true, journalId: true, storageKey: true, reviewFile: { select: { id: true } } },
    });
    if (!file?.reviewFile) return false;
    await this.s3(requestId).send(
      new DeleteObjectCommand({ Bucket: this.privateBucket(requestId), Key: file.storageKey }),
    );
    await database.$transaction([
      database.reviewFile.delete({ where: { id: file.reviewFile.id } }),
      database.storedFile.delete({ where: { id: file.id } }),
      database.auditEvent.create({
        data: {
          actorId: reviewerId,
          action: 'review.file_removed',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId,
          metadata: { assignmentId, journalId: file.journalId },
        },
      }),
    ]);
    return true;
  }

  async remind(invitationId: string, actorId: string, requestId: string) {
    const invitation = await database.reviewInvitation.findUnique({
      where: { id: invitationId },
      include: { round: true, reviewer: { select: { id: true, email: true } }, assignment: true },
    });
    if (!invitation || !(await this.editorAccess(invitation.round.submissionId, actorId)))
      return 'forbidden' as const;
    if (!['PENDING', 'ACCEPTED'].includes(invitation.status)) return 'state-conflict' as const;
    if (invitation.lastReminderAt && invitation.lastReminderAt > new Date(Date.now() - 86_400_000))
      return 'too-soon' as const;
    const now = new Date();
    const replacementToken =
      invitation.status === 'PENDING' ? randomBytes(32).toString('base64url') : null;
    await database.$transaction([
      database.reviewInvitation.update({
        where: { id: invitation.id },
        data: {
          reminderCount: { increment: 1 },
          lastReminderAt: now,
          ...(replacementToken ? { tokenHash: digest(replacementToken) } : {}),
        },
      }),
      database.auditEvent.create({
        data: {
          actorId,
          action: 'review.reminder_sent',
          targetType: 'ReviewInvitation',
          targetId: invitation.id,
          requestId,
          metadata: { status: invitation.status, reminderNumber: invitation.reminderCount + 1 },
        },
      }),
    ]);
    await this.emails.enqueue(
      replacementToken
        ? {
            event: 'peer-review.invitation-reminder',
            recipient: invitation.reviewer.email,
            userId: invitation.reviewer.id,
            invitationId: invitation.id,
            token: replacementToken,
            requestId,
            requestedAt: now.toISOString(),
          }
        : {
            event: 'peer-review.due-reminder',
            recipient: invitation.reviewer.email,
            userId: invitation.reviewer.id,
            assignmentId: invitation.assignment?.id ?? invitation.id,
            requestId,
            requestedAt: now.toISOString(),
          },
      `${invitation.id}-${invitation.reminderCount + 1}`,
    );
    return 'sent' as const;
  }

  editorRounds(submissionId: string, actorId: string) {
    return this.editorAccess(submissionId, actorId).then((access) =>
      access
        ? database.reviewRound.findMany({
            where: { submissionId },
            include: {
              reviewForm: { select: { id: true, name: true, version: true } },
              invitations: {
                include: {
                  reviewer: { select: { id: true, email: true, fullName: true } },
                  assignment: { include: { response: true } },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { sequence: 'desc' },
          })
        : null,
    );
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
