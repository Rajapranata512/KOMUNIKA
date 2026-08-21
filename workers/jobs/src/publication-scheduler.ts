import { database } from '@aksara/database';
import type { TransactionalEmailJob } from '@aksara/domain';

type PublicationNotifier = (job: TransactionalEmailJob, deliveryKey: string) => Promise<void>;

export async function publishDuePublications(
  now = new Date(),
  notify: PublicationNotifier = async () => undefined,
) {
  const due = await database.publication.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: {
      id: true,
      journalId: true,
      submissionId: true,
      issueId: true,
      submission: { select: { submitter: { select: { id: true, email: true } } } },
    },
  });
  let published = 0;
  for (const publication of due) {
    const changed = await database.$transaction(async (tx) => {
      const updated = await tx.publication.updateMany({
        where: { id: publication.id, status: 'SCHEDULED', scheduledAt: { lte: now } },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publicationKey: 'scheduled-' + publication.id,
        },
      });
      if (updated.count !== 1) return false;
      await tx.submission.update({
        where: { id: publication.submissionId },
        data: { state: 'PUBLISHED' },
      });
      if (publication.issueId)
        await tx.issue.updateMany({
          where: { id: publication.issueId, status: { not: 'PUBLISHED' } },
          data: { status: 'PUBLISHED', publishedAt: now },
        });
      await tx.auditEvent.create({
        data: {
          action: 'production.publication_published_scheduled',
          targetType: 'Publication',
          targetId: publication.id,
          requestId: 'publication-scheduler-' + publication.id,
          metadata: { journalId: publication.journalId },
        },
      });
      return true;
    });
    if (changed) {
      published += 1;
      await notify(
        {
          event: 'publication.published',
          recipient: publication.submission.submitter.email,
          userId: publication.submission.submitter.id,
          submissionId: publication.submissionId,
          requestId: 'publication-scheduler-' + publication.id,
          requestedAt: now.toISOString(),
        },
        publication.id,
      );
    }
  }
  return { examined: due.length, published };
}
