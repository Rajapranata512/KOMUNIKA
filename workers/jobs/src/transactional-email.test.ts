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
});
