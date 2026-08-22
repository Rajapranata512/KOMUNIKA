import { Injectable } from '@nestjs/common';
import { database, type Prisma } from '@aksara/database';
import { canTransitionSubmission, type SubmissionState } from '@aksara/domain';

import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';

const queueStates: SubmissionState[] = [
  'SUBMITTED',
  'INITIAL_SCREENING',
  'PRE_REVIEW_CORRECTION_REQUESTED',
  'EDITOR_ASSIGNED',
];

interface QueueFilters {
  journalId: string;
  state?: SubmissionState;
  query?: string;
  assigned?: 'all' | 'unassigned' | 'mine';
  sort?: 'oldest' | 'newest';
  cursor?: string;
}

interface AssessmentInput {
  completenessPassed: boolean;
  scopePassed: boolean;
  policyPassed: boolean;
  internalNote: string;
}

interface AssignmentInput {
  editorId: string;
  assignmentNote: string;
  overrideReason?: string;
}

interface DecisionInput {
  type: 'REQUEST_CORRECTION' | 'DESK_REJECT';
  reason: string;
  authorLetter: string;
  requiredChanges: string[];
}

const editorialDetail = {
  journal: { select: { id: true, title: true, reviewModel: true } },
  articleType: { select: { id: true, title: true, peerReviewRequired: true } },
  submitter: { select: { id: true, email: true } },
  authors: { orderBy: { sortOrder: 'asc' as const } },
  keywords: { orderBy: { sortOrder: 'asc' as const } },
  subjects: { orderBy: { sortOrder: 'asc' as const } },
  declarations: { orderBy: { declarationCode: 'asc' as const } },
  checklistAcceptances: { orderBy: { labelSnapshot: 'asc' as const } },
  files: {
    orderBy: [{ purpose: 'asc' as const }, { sortOrder: 'asc' as const }],
    select: {
      id: true,
      purpose: true,
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
  editorialAssignments: {
    orderBy: { assignedAt: 'desc' as const },
    include: {
      editor: { select: { id: true, email: true, fullName: true } },
      assignedBy: { select: { id: true, email: true, fullName: true } },
    },
  },
  screeningAssessments: {
    orderBy: { createdAt: 'desc' as const },
    include: { actor: { select: { id: true, email: true, fullName: true } } },
  },
  screeningDecisions: {
    orderBy: { createdAt: 'desc' as const },
    include: { actor: { select: { id: true, email: true, fullName: true } } },
  },
  editorialNotes: {
    orderBy: { createdAt: 'desc' as const },
    include: { actor: { select: { id: true, email: true, fullName: true } } },
  },
} satisfies Prisma.SubmissionInclude;

@Injectable()
export class EditorialService {
  constructor(private readonly emails: TransactionalEmailQueue) {}

  private async roles(journalId: string, userId: string) {
    return database.journalMembership
      .findMany({ where: { journalId, userId }, select: { role: true } })
      .then((memberships) => memberships.map(({ role }) => role));
  }

  listJournals(userId: string) {
    return database.journal.findMany({
      where: {
        memberships: {
          some: { userId, role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] } },
        },
      },
      select: {
        id: true,
        title: true,
        abbreviation: true,
        memberships: {
          where: { userId, role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] } },
          select: { role: true },
        },
        _count: {
          select: {
            submissions: {
              where: { state: { in: queueStates } },
            },
          },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  async listQueue(filters: QueueFilters, userId: string) {
    const roles = await this.roles(filters.journalId, userId);
    const isEditorInChief = roles.includes('EDITOR_IN_CHIEF');
    const isSectionEditor = roles.includes('SECTION_EDITOR');
    if (!isEditorInChief && !isSectionEditor) return null;

    const state = filters.state && queueStates.includes(filters.state) ? filters.state : undefined;
    const where: Prisma.SubmissionWhereInput = {
      journalId: filters.journalId,
      state: state ?? { in: queueStates },
      ...(filters.query
        ? { title: { contains: filters.query.trim(), mode: 'insensitive' as const } }
        : {}),
      ...(!isEditorInChief || filters.assigned === 'mine'
        ? { editorialAssignments: { some: { editorId: userId, active: true } } }
        : filters.assigned === 'unassigned'
          ? { editorialAssignments: { none: { active: true } } }
          : {}),
    };
    const newest = filters.sort === 'newest';
    const submissions = await database.submission.findMany({
      where,
      take: 26,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: [{ submittedAt: newest ? 'desc' : 'asc' }, { id: newest ? 'desc' : 'asc' }],
      select: {
        id: true,
        title: true,
        state: true,
        submittedAt: true,
        updatedAt: true,
        journal: { select: { id: true, title: true } },
        articleType: { select: { title: true } },
        editorialAssignments: {
          where: { active: true },
          select: { editor: { select: { id: true, email: true, fullName: true } } },
        },
      },
    });
    const hasMore = submissions.length > 25;
    const items = submissions.slice(0, 25).map((submission) => ({
      ...submission,
      ageInDays: submission.submittedAt
        ? Math.max(0, Math.floor((Date.now() - submission.submittedAt.getTime()) / 86_400_000))
        : 0,
      nextAction:
        submission.state === 'SUBMITTED'
          ? 'Mulai screening'
          : submission.state === 'INITIAL_SCREENING'
            ? 'Catat keputusan screening'
            : submission.state === 'PRE_REVIEW_CORRECTION_REQUESTED'
              ? 'Menunggu koreksi penulis'
              : 'Kelola assignment',
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }

  async detail(submissionId: string, userId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: editorialDetail,
    });
    if (!submission) return null;
    const roles = await this.roles(submission.journalId, userId);
    const canViewAll = roles.includes('EDITOR_IN_CHIEF');
    const assigned = submission.editorialAssignments.some(
      (assignment) => assignment.active && assignment.editorId === userId,
    );
    if (!canViewAll && !assigned) return null;
    const editorCandidates = canViewAll
      ? await database.journalMembership.findMany({
          where: {
            journalId: submission.journalId,
            role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] },
          },
          select: { role: true, user: { select: { id: true, email: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return { submission, permissions: { canAssign: canViewAll }, editorCandidates };
  }

  async recordAssessment(
    submissionId: string,
    actorId: string,
    input: AssessmentInput,
    requestId: string,
  ) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, journalId: true, state: true },
    });
    if (!submission) return 'not-found' as const;
    if (!(await this.roles(submission.journalId, actorId)).includes('EDITOR_IN_CHIEF'))
      return 'forbidden' as const;
    if (!['SUBMITTED', 'INITIAL_SCREENING'].includes(submission.state))
      return 'state-conflict' as const;

    return database.$transaction(async (transaction) => {
      if (submission.state === 'SUBMITTED') {
        if (!canTransitionSubmission('SUBMITTED', 'INITIAL_SCREENING'))
          return 'state-conflict' as const;
        await transaction.submission.update({
          where: { id: submission.id },
          data: { state: 'INITIAL_SCREENING' },
        });
        await transaction.submissionTimelineEvent.create({
          data: {
            submissionId,
            actorId,
            state: 'INITIAL_SCREENING',
            action: 'screening.started',
            description: 'Submission memasuki pemeriksaan awal editorial.',
          },
        });
      }
      const assessment = await transaction.screeningAssessment.create({
        data: { ...input, journalId: submission.journalId, submissionId, actorId },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: 'editorial.screening_assessed',
          targetType: 'Submission',
          targetId: submissionId,
          requestId,
          metadata: {
            journalId: submission.journalId,
            completenessPassed: input.completenessPassed,
            scopePassed: input.scopePassed,
            policyPassed: input.policyPassed,
          },
        },
      });
      return assessment;
    });
  }

  async assignEditor(
    submissionId: string,
    actorId: string,
    input: AssignmentInput,
    requestId: string,
  ) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: {
        screeningAssessments: { orderBy: { createdAt: 'desc' }, take: 1 },
        editorialAssignments: { where: { active: true }, take: 1 },
      },
    });
    if (!submission) return 'not-found' as const;
    if (!(await this.roles(submission.journalId, actorId)).includes('EDITOR_IN_CHIEF'))
      return 'forbidden' as const;
    if (!['INITIAL_SCREENING', 'EDITOR_ASSIGNED'].includes(submission.state))
      return 'state-conflict' as const;
    const assessment = submission.screeningAssessments[0];
    if (!assessment?.completenessPassed || !assessment.scopePassed || !assessment.policyPassed)
      return 'screening-incomplete' as const;
    const candidate = await database.journalMembership.findFirst({
      where: {
        journalId: submission.journalId,
        userId: input.editorId,
        role: { in: ['EDITOR_IN_CHIEF', 'SECTION_EDITOR'] },
        user: { disabledAt: null },
      },
      select: { user: { select: { id: true, email: true } } },
    });
    if (!candidate) return 'invalid-editor' as const;
    const existing = submission.editorialAssignments[0];
    if (existing?.editorId === input.editorId) return existing;
    if (existing && !input.overrideReason) return 'override-reason-required' as const;

    const assignment = await database.$transaction(async (transaction) => {
      if (existing)
        await transaction.editorialAssignment.update({
          where: { id: existing.id },
          data: { active: false, endedAt: new Date() },
        });
      const created = await transaction.editorialAssignment.create({
        data: {
          journalId: submission.journalId,
          submissionId,
          editorId: input.editorId,
          assignedById: actorId,
          assignmentNote: input.assignmentNote,
          overrideReason: existing ? input.overrideReason : null,
        },
      });
      await transaction.screeningDecision.create({
        data: {
          journalId: submission.journalId,
          submissionId,
          actorId,
          type: 'ASSIGN_EDITOR',
          reason: input.assignmentNote || 'Screening completed; handling editor assigned.',
          resultingState: 'EDITOR_ASSIGNED',
        },
      });
      if (submission.state === 'INITIAL_SCREENING')
        await transaction.submission.update({
          where: { id: submissionId },
          data: { state: 'EDITOR_ASSIGNED' },
        });
      await transaction.submissionTimelineEvent.create({
        data: {
          submissionId,
          actorId,
          state: 'EDITOR_ASSIGNED',
          action: 'editorial.assignment_created',
          description: 'Handling editor telah ditugaskan.',
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: existing ? 'editorial.assignment_overridden' : 'editorial.assignment_created',
          targetType: 'Submission',
          targetId: submissionId,
          requestId,
          metadata: {
            journalId: submission.journalId,
            editorId: input.editorId,
            overrodeAssignmentId: existing?.id ?? null,
          },
        },
      });
      return created;
    });
    const delivery = await this.emails.enqueue(
      {
        event: 'editorial.assignment-created',
        recipient: candidate.user.email,
        userId: candidate.user.id,
        submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      assignment.id,
    );
    return { assignment, delivery };
  }

  async decide(submissionId: string, actorId: string, input: DecisionInput, requestId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: { submitter: { select: { id: true, email: true } } },
    });
    if (!submission) return 'not-found' as const;
    if (!(await this.roles(submission.journalId, actorId)).includes('EDITOR_IN_CHIEF'))
      return 'forbidden' as const;
    if (submission.state !== 'INITIAL_SCREENING') return 'state-conflict' as const;
    if (input.type === 'REQUEST_CORRECTION' && !input.requiredChanges.length)
      return 'required-changes-missing' as const;
    const resultingState =
      input.type === 'REQUEST_CORRECTION'
        ? ('PRE_REVIEW_CORRECTION_REQUESTED' as const)
        : ('DESK_REJECTED' as const);
    if (!canTransitionSubmission('INITIAL_SCREENING', resultingState))
      return 'state-conflict' as const;

    const decision = await database.$transaction(async (transaction) => {
      const created = await transaction.screeningDecision.create({
        data: {
          journalId: submission.journalId,
          submissionId,
          actorId,
          type: input.type,
          reason: input.reason,
          authorLetter: input.authorLetter,
          requiredChanges: input.requiredChanges,
          resultingState,
        },
      });
      await transaction.submission.update({
        where: { id: submissionId },
        data: { state: resultingState },
      });
      await transaction.submissionTimelineEvent.create({
        data: {
          submissionId,
          actorId,
          state: resultingState,
          action:
            input.type === 'REQUEST_CORRECTION'
              ? 'screening.correction_requested'
              : 'screening.desk_rejected',
          description:
            input.type === 'REQUEST_CORRECTION'
              ? 'Perbaikan pra-review diminta oleh tim editorial.'
              : 'Keputusan desk reject telah diterbitkan.',
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action:
            input.type === 'REQUEST_CORRECTION'
              ? 'editorial.correction_requested'
              : 'editorial.desk_rejected',
          targetType: 'Submission',
          targetId: submissionId,
          requestId,
          metadata: { journalId: submission.journalId, decisionId: created.id },
        },
      });
      return created;
    });
    const delivery = await this.emails.enqueue(
      {
        event:
          input.type === 'REQUEST_CORRECTION'
            ? 'editorial.pre-review-correction'
            : 'editorial.desk-rejected',
        recipient: submission.submitter.email,
        userId: submission.submitter.id,
        submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      decision.id,
    );
    return { decision, delivery };
  }

  async addInternalNote(submissionId: string, actorId: string, body: string, requestId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: { editorialAssignments: { where: { active: true, editorId: actorId }, take: 1 } },
    });
    if (!submission) return 'not-found' as const;
    const roles = await this.roles(submission.journalId, actorId);
    if (!roles.includes('EDITOR_IN_CHIEF') && !submission.editorialAssignments.length)
      return 'forbidden' as const;
    return database.$transaction(async (transaction) => {
      const note = await transaction.internalEditorialNote.create({
        data: { journalId: submission.journalId, submissionId, actorId, body },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: 'editorial.internal_note_added',
          targetType: 'Submission',
          targetId: submissionId,
          requestId,
          metadata: { journalId: submission.journalId, noteId: note.id },
        },
      });
      return note;
    });
  }
}
