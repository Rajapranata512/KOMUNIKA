import type { TransactionalEmailJob } from '@aksara/domain';
import { describe, expect, it, vi } from 'vitest';

import { deliverTransactionalEmail, renderTransactionalEmail } from './transactional-email.js';

const job: TransactionalEmailJob = {
  event: 'identity.verify-email',
  recipient: 'reader@example.test',
  token: 'a'.repeat(43),
  userId: 'user-1',
  requestId: 'request-1',
  requestedAt: '2026-08-20T00:00:00.000Z',
};

describe('transactional email worker', () => {
  it('renders a verification URL without placing the token in the subject', () => {
    const rendered = renderTransactionalEmail(
      job,
      'https://journal.example.test',
      'noreply@example.test',
    );

    expect(rendered.to).toBe(job.recipient);
    expect(rendered.subject).not.toContain(job.token);
    expect(rendered.text).toContain(`/verify-email?token=${job.token}`);
  });

  it('hands the rendered message to the SMTP adapter', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });

    await deliverTransactionalEmail(
      { ...job, event: 'identity.password-reset' },
      'https://journal.example.test',
      'noreply@example.test',
      { sendMail } as never,
    );

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]?.[0]?.text).toContain('/forgot-password?token=');
  });

  it('rejects malformed payloads before SMTP delivery', async () => {
    const sendMail = vi.fn();

    await expect(
      deliverTransactionalEmail(
        { ...job, token: 'short' },
        'https://journal.example.test',
        'noreply@example.test',
        { sendMail } as never,
      ),
    ).rejects.toThrow('payload is invalid');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('renders an editorial assignment link without manuscript content in the job', () => {
    const editorialJob: TransactionalEmailJob = {
      event: 'editorial.assignment-created',
      recipient: 'editor@example.test',
      submissionId: 'submission-1',
      userId: 'editor-1',
      requestId: 'request-2',
      requestedAt: '2026-08-20T00:00:00.000Z',
    };
    const rendered = renderTransactionalEmail(
      editorialJob,
      'https://journal.example.test',
      'noreply@example.test',
    );

    expect(rendered.text).toContain('/editorial/submissions/submission-1');
    expect(editorialJob).not.toHaveProperty('authorLetter');
    expect(editorialJob).not.toHaveProperty('submissionTitle');
  });

  it('renders a reviewer invitation with an opaque token and no manuscript or identity content', () => {
    const reviewJob: TransactionalEmailJob = {
      event: 'peer-review.invited',
      recipient: 'reviewer@example.test',
      invitationId: 'invitation-1',
      token: 'b'.repeat(43),
      userId: 'reviewer-1',
      requestId: 'request-3',
      requestedAt: '2026-08-20T00:00:00.000Z',
    };
    const rendered = renderTransactionalEmail(
      reviewJob,
      'https://journal.example.test',
      'noreply@example.test',
    );

    expect(rendered.subject).not.toContain(reviewJob.token);
    expect(rendered.text).toContain(`/reviewer/invitations/invitation-1?token=${reviewJob.token}`);
    expect(reviewJob).not.toHaveProperty('submissionTitle');
    expect(reviewJob).not.toHaveProperty('authorName');
    expect(reviewJob).not.toHaveProperty('confidentialComments');
  });

  it('routes decision and revision events without embedding decision or review content', () => {
    const decisionJob: TransactionalEmailJob = {
      event: 'editorial.decision-released',
      recipient: 'author@example.test',
      submissionId: 'submission-2',
      userId: 'author-2',
      requestId: 'request-4',
      requestedAt: '2026-08-20T00:00:00.000Z',
    };
    const revisionJob: TransactionalEmailJob = {
      ...decisionJob,
      event: 'editorial.revision-submitted',
      recipient: 'editor@example.test',
      userId: 'editor-2',
    };
    const decision = renderTransactionalEmail(
      decisionJob,
      'https://journal.example.test',
      'noreply@example.test',
    );
    const revision = renderTransactionalEmail(
      revisionJob,
      'https://journal.example.test',
      'noreply@example.test',
    );

    expect(decision.text).toContain('/workspace/submissions/submission-2');
    expect(revision.text).toContain('/editorial/submissions/submission-2');
    expect(decisionJob).not.toHaveProperty('decisionLetter');
    expect(decisionJob).not.toHaveProperty('reviewComments');
  });

  it('routes production and publication events without embedding manuscript content', () => {
    const events = [
      'production.assignment-created',
      'production.query-opened',
      'publication.scheduled',
      'publication.published',
    ] as const;
    for (const event of events) {
      const productionJob: TransactionalEmailJob = {
        event,
        recipient: 'recipient@example.test',
        submissionId: 'submission-production',
        userId: 'user-production',
        requestId: 'request-production',
        requestedAt: '2026-08-20T00:00:00.000Z',
      };
      const rendered = renderTransactionalEmail(
        productionJob,
        'https://journal.example.test',
        'noreply@example.test',
      );
      expect(rendered.text).toContain('/production/submissions/submission-production');
      expect(productionJob).not.toHaveProperty('submissionTitle');
      expect(productionJob).not.toHaveProperty('query');
      expect(productionJob).not.toHaveProperty('publicationMetadata');
    }
  });
});
