export const submissionStates = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_SCREENING',
  'PRE_REVIEW_CORRECTION_REQUESTED',
  'EDITOR_ASSIGNED',
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
  'RESUBMITTED',
  'ACCEPTED',
  'COPYEDITING',
  'PRODUCTION',
  'SCHEDULED',
  'PUBLISHED',
  'DESK_REJECTED',
  'REJECTED',
  'WITHDRAWN',
  'DECLINED_BY_JOURNAL',
  'RETRACTED',
  'ARCHIVED',
] as const;

export type SubmissionState = (typeof submissionStates)[number];

export const submissionStateLabels: Record<SubmissionState, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  INITIAL_SCREENING: 'Initial screening',
  PRE_REVIEW_CORRECTION_REQUESTED: 'Pre-review correction requested',
  EDITOR_ASSIGNED: 'Editor assigned',
  UNDER_REVIEW: 'Under review',
  REVISION_REQUIRED: 'Revision required',
  RESUBMITTED: 'Resubmitted',
  ACCEPTED: 'Accepted',
  COPYEDITING: 'Copyediting',
  PRODUCTION: 'In production',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  DESK_REJECTED: 'Desk rejected',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  DECLINED_BY_JOURNAL: 'Declined by journal',
  RETRACTED: 'Retracted',
  ARCHIVED: 'Archived',
};

const allowedTransitions: Readonly<Record<SubmissionState, readonly SubmissionState[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['INITIAL_SCREENING', 'WITHDRAWN'],
  INITIAL_SCREENING: [
    'PRE_REVIEW_CORRECTION_REQUESTED',
    'EDITOR_ASSIGNED',
    'DESK_REJECTED',
    'WITHDRAWN',
  ],
  PRE_REVIEW_CORRECTION_REQUESTED: ['SUBMITTED', 'WITHDRAWN'],
  EDITOR_ASSIGNED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['REVISION_REQUIRED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  REVISION_REQUIRED: ['RESUBMITTED', 'WITHDRAWN'],
  RESUBMITTED: ['EDITOR_ASSIGNED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['COPYEDITING'],
  COPYEDITING: ['PRODUCTION'],
  PRODUCTION: ['SCHEDULED'],
  SCHEDULED: ['PUBLISHED'],
  PUBLISHED: ['RETRACTED'],
  DESK_REJECTED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  WITHDRAWN: ['ARCHIVED'],
  DECLINED_BY_JOURNAL: ['ARCHIVED'],
  RETRACTED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionSubmission(from: SubmissionState, to: SubmissionState): boolean {
  return allowedTransitions[from].includes(to);
}

export const authorProgressPhases = ['WAITING', 'REVIEWED', 'EVALUATION', 'ACCEPTED'] as const;
export type AuthorProgressPhase = (typeof authorProgressPhases)[number];

export const authorProgressLabels: Record<AuthorProgressPhase, string> = {
  WAITING: 'Waiting',
  REVIEWED: 'Reviewed',
  EVALUATION: 'Evaluation',
  ACCEPTED: 'Accepted',
};

const authorPhaseByState: Partial<Record<SubmissionState, AuthorProgressPhase>> = {
  SUBMITTED: 'WAITING',
  INITIAL_SCREENING: 'WAITING',
  PRE_REVIEW_CORRECTION_REQUESTED: 'WAITING',
  EDITOR_ASSIGNED: 'REVIEWED',
  UNDER_REVIEW: 'REVIEWED',
  REVISION_REQUIRED: 'EVALUATION',
  RESUBMITTED: 'EVALUATION',
  ACCEPTED: 'ACCEPTED',
  COPYEDITING: 'ACCEPTED',
  PRODUCTION: 'ACCEPTED',
  SCHEDULED: 'ACCEPTED',
  PUBLISHED: 'ACCEPTED',
};

export function getAuthorProgressPhase(state: SubmissionState): AuthorProgressPhase | null {
  return authorPhaseByState[state] ?? null;
}
