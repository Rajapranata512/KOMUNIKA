import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { database, Prisma } from '@aksara/database';
import { canTransitionSubmission } from '@aksara/domain';

interface AuthorInput {
  givenName: string;
  familyName: string;
  email: string;
  affiliation: string;
  countryCode?: string | null;
  orcidId?: string | null;
  isCorresponding: boolean;
}

export interface DraftInput {
  articleTypeId?: string;
  title?: string;
  subtitle?: string | null;
  abstract?: string;
  coverLetter?: string;
  language?: string;
  authors?: AuthorInput[];
  keywords?: string[];
  subjects?: string[];
  declarationAcceptances?: Array<{ declarationId: string; accepted: boolean }>;
  checklistAcceptances?: Array<{ checklistItemId: string; accepted: boolean }>;
}

const detailInclude = {
  journal: {
    select: {
      id: true,
      slug: true,
      title: true,
      submissionsOpen: true,
      status: true,
      articleTypes: {
        where: { isActive: true },
        select: { id: true, title: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
  articleType: { select: { id: true, title: true, isActive: true } },
  authors: { orderBy: { sortOrder: 'asc' as const } },
  keywords: { orderBy: { sortOrder: 'asc' as const } },
  subjects: { orderBy: { sortOrder: 'asc' as const } },
  declarations: { orderBy: { declarationCode: 'asc' as const } },
  checklistAcceptances: { orderBy: { labelSnapshot: 'asc' as const } },
  timeline: {
    where: { visibleToAuthor: true },
    orderBy: { createdAt: 'asc' as const },
  },
  screeningDecisions: {
    where: { type: { in: ['REQUEST_CORRECTION' as const, 'DESK_REJECT' as const] } },
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      type: true,
      authorLetter: true,
      requiredChanges: true,
      resultingState: true,
      createdAt: true,
    },
  },
  editorialDecisions: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      type: true,
      resultingState: true,
      releasedAt: true,
      revisionDueAt: true,
      responseRequired: true,
      evaluationMode: true,
      targetVersion: { select: { id: true, version: true } },
      letter: { select: { subject: true, body: true } },
      reviewReleases: {
        select: { id: true, commentsToAuthorSnapshot: true },
        orderBy: { createdAt: 'asc' as const },
      },
      fileReleases: {
        select: {
          id: true,
          originalNameSnapshot: true,
          reviewFile: {
            select: {
              storedFile: {
                select: { id: true, size: true, detectedMime: true, scanStatus: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  revisions: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      responseRequired: true,
      responseText: true,
      dueAt: true,
      submittedAt: true,
      baseVersion: { select: { id: true, version: true } },
      submittedVersion: { select: { id: true, version: true } },
      files: {
        orderBy: [{ purpose: 'asc' as const }, { sortOrder: 'asc' as const }],
        select: {
          purpose: true,
          storedFile: {
            select: {
              id: true,
              originalName: true,
              size: true,
              detectedMime: true,
              scanStatus: true,
            },
          },
        },
      },
    },
  },
  versions: {
    orderBy: { version: 'asc' as const },
    select: { id: true, version: true, createdAt: true },
  },
  files: {
    orderBy: [{ purpose: 'asc' as const }, { sortOrder: 'asc' as const }],
    select: {
      id: true,
      purpose: true,
      sortOrder: true,
      revisionId: true,
      storedFile: {
        select: {
          id: true,
          originalName: true,
          declaredMime: true,
          detectedMime: true,
          size: true,
          checksumSha256: true,
          scanStatus: true,
          visibility: true,
          uploadedAt: true,
          scannedAt: true,
        },
      },
    },
  },
};

@Injectable()
export class SubmissionService {
  async listForAuthor(userId: string) {
    return database.submission.findMany({
      where: { submitterId: userId },
      select: {
        id: true,
        state: true,
        title: true,
        submittedAt: true,
        updatedAt: true,
        journal: { select: { slug: true, title: true } },
        articleType: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  getForAuthor(submissionId: string, userId: string) {
    return database.submission.findFirst({
      where: { id: submissionId, submitterId: userId },
      include: detailInclude,
    });
  }

  async createDraft(journalId: string, articleTypeId: string, userId: string, requestId: string) {
    const [journal, user] = await Promise.all([
      database.journal.findFirst({
        where: {
          id: journalId,
          status: 'PUBLISHED',
          submissionsOpen: true,
          articleTypes: { some: { id: articleTypeId, isActive: true } },
        },
        include: {
          declarations: { where: { isActive: true }, orderBy: { code: 'asc' } },
          checklistItems: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      database.user.findUnique({ where: { id: userId } }),
    ]);
    if (!journal || !user?.emailVerifiedAt || user.disabledAt) return null;

    const names = (user.fullName ?? user.email.split('@')[0] ?? 'Author').trim().split(/\s+/);
    const familyName = names.length > 1 ? (names.pop() ?? '') : '';
    const givenName = names.join(' ');
    return database.$transaction(async (transaction) => {
      const submission = await transaction.submission.create({
        data: {
          journalId,
          articleTypeId,
          submitterId: userId,
          language: journal.primaryLanguage,
          authors: {
            create: {
              userId,
              givenName,
              familyName,
              email: user.email,
              affiliation: user.affiliation ?? '',
              countryCode: user.countryCode,
              orcidId: user.orcidId,
              isCorresponding: true,
              sortOrder: 0,
            },
          },
          declarations: {
            create: journal.declarations.map((declaration) => ({
              declarationId: declaration.id,
              declarationTitle: declaration.title,
              declarationBody: declaration.body,
              declarationCode: declaration.code,
              declarationVersion: declaration.version,
              requiredSnapshot: declaration.isRequired,
            })),
          },
          checklistAcceptances: {
            create: journal.checklistItems.map((item) => ({
              checklistItemId: item.id,
              labelSnapshot: item.label,
              requiredSnapshot: item.isRequired,
            })),
          },
          timeline: {
            create: {
              actorId: userId,
              state: 'DRAFT',
              action: 'submission.draft_created',
              description: 'Draf submission dibuat.',
            },
          },
        },
      });
      await transaction.journalMembership.upsert({
        where: {
          journalId_userId_role: { journalId, userId, role: 'AUTHOR' },
        },
        create: { journalId, userId, role: 'AUTHOR' },
        update: {},
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'submission.draft_created',
          targetType: 'Submission',
          targetId: submission.id,
          requestId,
          metadata: { journalId },
        },
      });
      return submission;
    });
  }

  async updateDraft(submissionId: string, userId: string, input: DraftInput, requestId: string) {
    const submission = await database.submission.findFirst({
      where: { id: submissionId, submitterId: userId, state: 'DRAFT' },
      select: { id: true, journalId: true, articleTypeId: true },
    });
    if (!submission) return null;
    if (input.articleTypeId) {
      const validType = await database.articleType.findFirst({
        where: { id: input.articleTypeId, journalId: submission.journalId, isActive: true },
        select: { id: true },
      });
      if (!validType) return 'invalid-article-type' as const;
    }

    const now = new Date();
    await database.$transaction(async (transaction) => {
      await transaction.submission.update({
        where: { id: submissionId },
        data: {
          articleTypeId: input.articleTypeId,
          title: input.title,
          subtitle: input.subtitle,
          abstract: input.abstract,
          coverLetter: input.coverLetter,
          language: input.language,
        },
      });
      if (input.authors) {
        await transaction.submissionAuthor.deleteMany({ where: { submissionId } });
        if (input.authors.length)
          await transaction.submissionAuthor.createMany({
            data: input.authors.map((author, sortOrder) => ({
              submissionId,
              ...author,
              email: author.email.trim().toLowerCase(),
              sortOrder,
            })),
          });
      }
      if (input.keywords) {
        await transaction.submissionKeyword.deleteMany({ where: { submissionId } });
        if (input.keywords.length)
          await transaction.submissionKeyword.createMany({
            data: input.keywords.map((value, sortOrder) => ({
              submissionId,
              value,
              sortOrder,
            })),
          });
      }
      if (input.subjects) {
        await transaction.submissionSubject.deleteMany({ where: { submissionId } });
        if (input.subjects.length)
          await transaction.submissionSubject.createMany({
            data: input.subjects.map((value, sortOrder) => ({
              submissionId,
              value,
              sortOrder,
            })),
          });
      }
      for (const acceptance of input.declarationAcceptances ?? [])
        await transaction.submissionDeclarationAcceptance.updateMany({
          where: {
            submissionId,
            declarationId: acceptance.declarationId,
            declaration: { journalId: submission.journalId },
          },
          data: {
            accepted: acceptance.accepted,
            acceptedAt: acceptance.accepted ? now : null,
          },
        });
      for (const acceptance of input.checklistAcceptances ?? [])
        await transaction.submissionChecklistAcceptance.updateMany({
          where: {
            submissionId,
            checklistItemId: acceptance.checklistItemId,
            checklistItem: { journalId: submission.journalId },
          },
          data: {
            accepted: acceptance.accepted,
            acceptedAt: acceptance.accepted ? now : null,
          },
        });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'submission.draft_saved',
          targetType: 'Submission',
          targetId: submissionId,
          requestId,
          metadata: { fields: Object.keys(input) },
        },
      });
    });
    return this.getForAuthor(submissionId, userId);
  }

  async finalize(submissionId: string, userId: string, idempotencyKey: string, requestId: string) {
    const finalizationKey = createHash('sha256').update(idempotencyKey).digest('hex');
    const existing = await database.submission.findUnique({
      where: { finalizationKey },
      select: { id: true, submitterId: true },
    });
    if (existing) {
      if (existing.id !== submissionId || existing.submitterId !== userId)
        return 'idempotency-conflict' as const;
      return this.getForAuthor(submissionId, userId);
    }
    const [submission, user] = await Promise.all([
      this.getForAuthor(submissionId, userId),
      database.user.findUnique({
        where: { id: userId },
        select: { emailVerifiedAt: true, disabledAt: true },
      }),
    ]);
    if (!submission || submission.state !== 'DRAFT') return null;
    const errors: string[] = [];
    if (!user?.emailVerifiedAt || user.disabledAt) errors.push('EMAIL_VERIFICATION_REQUIRED');
    if (submission.journal.status !== 'PUBLISHED' || !submission.journal.submissionsOpen)
      errors.push('JOURNAL_SUBMISSIONS_CLOSED');
    if (!submission.articleType.isActive) errors.push('ARTICLE_TYPE_INACTIVE');
    if (submission.title.trim().length < 10) errors.push('TITLE_REQUIRED');
    if (submission.abstract.trim().length < 100) errors.push('ABSTRACT_TOO_SHORT');
    if (!submission.keywords.length) errors.push('KEYWORD_REQUIRED');
    if (!submission.authors.length) errors.push('AUTHOR_REQUIRED');
    if (submission.authors.filter(({ isCorresponding }) => isCorresponding).length !== 1)
      errors.push('CORRESPONDING_AUTHOR_REQUIRED');
    if (
      submission.authors.some(
        ({ givenName, email, affiliation }) =>
          !givenName.trim() || !email.includes('@') || !affiliation.trim(),
      )
    )
      errors.push('AUTHOR_METADATA_INCOMPLETE');
    if (
      submission.declarations.some(
        ({ requiredSnapshot, accepted }) => requiredSnapshot && !accepted,
      )
    )
      errors.push('DECLARATION_REQUIRED');
    if (
      submission.checklistAcceptances.some(
        ({ requiredSnapshot, accepted }) => requiredSnapshot && !accepted,
      )
    )
      errors.push('CHECKLIST_REQUIRED');
    if (
      !submission.files.some(
        ({ purpose, storedFile }) => purpose === 'MANUSCRIPT' && storedFile.scanStatus === 'CLEAN',
      )
    )
      errors.push('CLEAN_MANUSCRIPT_REQUIRED');
    if (submission.files.some(({ storedFile }) => storedFile.scanStatus !== 'CLEAN'))
      errors.push('FILE_SCAN_PENDING_OR_REJECTED');
    if (errors.length) return { validationErrors: [...new Set(errors)] };
    if (!canTransitionSubmission('DRAFT', 'SUBMITTED'))
      return { validationErrors: ['SUBMISSION_TRANSITION_NOT_ALLOWED'] };

    const now = new Date();
    const snapshot = {
      title: submission.title,
      subtitle: submission.subtitle,
      abstract: submission.abstract,
      coverLetter: submission.coverLetter,
      language: submission.language,
      articleType: submission.articleType,
      authors: submission.authors.map(
        ({
          givenName,
          familyName,
          email,
          affiliation,
          countryCode,
          orcidId,
          isCorresponding,
          sortOrder,
        }) => ({
          givenName,
          familyName,
          email,
          affiliation,
          countryCode,
          orcidId,
          isCorresponding,
          sortOrder,
        }),
      ),
      keywords: submission.keywords.map(({ value }) => value),
      subjects: submission.subjects.map(({ value }) => value),
      declarations: submission.declarations.map(
        ({
          declarationCode,
          declarationVersion,
          declarationTitle,
          declarationBody,
          acceptedAt,
        }) => ({
          declarationCode,
          declarationVersion,
          declarationTitle,
          declarationBody,
          acceptedAt: acceptedAt?.toISOString(),
        }),
      ),
      checklist: submission.checklistAcceptances.map(({ labelSnapshot, acceptedAt }) => ({
        label: labelSnapshot,
        acceptedAt: acceptedAt?.toISOString(),
      })),
      files: submission.files.map(({ purpose, storedFile }) => ({
        purpose,
        fileId: storedFile.id,
        originalName: storedFile.originalName,
        detectedMime: storedFile.detectedMime,
        size: storedFile.size,
        checksumSha256: storedFile.checksumSha256,
      })),
      submittedAt: now.toISOString(),
    };
    await database.$transaction(
      async (transaction) => {
        const updated = await transaction.submission.updateMany({
          where: { id: submissionId, submitterId: userId, state: 'DRAFT' },
          data: { state: 'SUBMITTED', submittedAt: now, finalizationKey },
        });
        if (updated.count !== 1) throw new Error('SUBMISSION_FINALIZATION_RACE');
        await transaction.submissionVersion.create({
          data: {
            submissionId,
            version: 1,
            snapshot: snapshot as Prisma.InputJsonValue,
          },
        });
        await transaction.submissionTimelineEvent.create({
          data: {
            submissionId,
            actorId: userId,
            state: 'SUBMITTED',
            action: 'submission.finalized',
            description: 'Submission dikirim ke jurnal.',
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorId: userId,
            action: 'submission.finalized',
            targetType: 'Submission',
            targetId: submissionId,
            requestId,
            metadata: { journalId: submission.journalId, version: 1 },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getForAuthor(submissionId, userId);
  }
}
