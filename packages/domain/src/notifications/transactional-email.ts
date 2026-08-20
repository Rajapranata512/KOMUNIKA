export const TRANSACTIONAL_EMAIL_QUEUE = 'transactional-email';

export const transactionalEmailEvents = [
  'identity.verify-email',
  'identity.password-reset',
] as const;

export type TransactionalEmailEvent = (typeof transactionalEmailEvents)[number];

export interface TransactionalEmailJob {
  event: TransactionalEmailEvent;
  recipient: string;
  token: string;
  userId: string;
  requestId: string;
  requestedAt: string;
}

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
