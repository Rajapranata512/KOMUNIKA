import { describe, expect, it, vi } from 'vitest';
import { database } from '@aksara/database';
import { publishDuePublications } from './publication-scheduler.js';

vi.mock('@aksara/database', () => ({
  database: { publication: { findMany: vi.fn() }, $transaction: vi.fn() },
}));
describe('publication scheduler', () => {
  it('publishes due records through a guarded idempotent transaction', async () => {
    vi.mocked(database.publication.findMany).mockResolvedValue([
      {
        id: 'publication-1',
        journalId: 'journal-1',
        submissionId: 'submission-1',
        issueId: 'issue-1',
        submission: { submitter: { id: 'author-1', email: 'author@example.test' } },
      },
    ] as never);
    const tx = {
      publication: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      submission: { update: vi.fn() },
      issue: { updateMany: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const transaction = database.$transaction as unknown as ReturnType<typeof vi.fn>;
    transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    const notify = vi.fn().mockResolvedValue(undefined);
    await expect(publishDuePublications(new Date('2026-08-20T00:00:00Z'), notify)).resolves.toEqual(
      {
        examined: 1,
        published: 1,
      },
    );
    expect(tx.publication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'publication.published',
        recipient: 'author@example.test',
        submissionId: 'submission-1',
      }),
      'publication-1',
    );
  });
});
