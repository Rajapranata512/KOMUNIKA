export const TRANSACTIONAL_EMAIL_QUEUE = 'transactional-email';

export const transactionalEmailEvents = [
  'identity.verify-email',
  'identity.password-reset',
  'editorial.pre-review-correction',
  'editorial.desk-rejected',
  'editorial.assignment-created',
  'editorial.decision-released',
  'editorial.revision-submitted',
  'editorial.revision-reminder',
  'peer-review.invited',
  'peer-review.invitation-reminder',
  'peer-review.due-reminder',
  'peer-review.responded',
  'peer-review.submitted',
  'production.assignment-created',
  'production.query-opened',
  'publication.scheduled',
  'publication.published',
] as const;

export type TransactionalEmailEvent = (typeof transactionalEmailEvents)[number];

interface TransactionalEmailJobBase {
  recipient: string;
  userId: string;
  requestId: string;
  requestedAt: string;
}

export type TransactionalEmailJob = TransactionalEmailJobBase &
  (
    | {
        event: 'identity.verify-email' | 'identity.password-reset';
        token: string;
      }
    | {
        event:
          | 'editorial.pre-review-correction'
          | 'editorial.desk-rejected'
          | 'editorial.assignment-created'
          | 'editorial.decision-released'
          | 'editorial.revision-submitted'
          | 'editorial.revision-reminder'
          | 'production.assignment-created'
          | 'production.query-opened'
          | 'publication.scheduled'
          | 'publication.published';
        submissionId: string;
      }
    | {
        event: 'peer-review.invited' | 'peer-review.invitation-reminder';
        invitationId: string;
        token: string;
      }
    | {
        event: 'peer-review.due-reminder' | 'peer-review.responded' | 'peer-review.submitted';
        assignmentId: string;
      }
  );

export const TRANSACTIONAL_EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400, count: 1_000 },
} as const;

export function transactionalEmailJobId(
  event: TransactionalEmailEvent,
  deliveryKey: string,
): string {
  return `${event.replaceAll('.', '-')}-${deliveryKey}`;
}
