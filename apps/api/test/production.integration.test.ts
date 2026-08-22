import { randomUUID } from 'node:crypto';
import { database, Prisma } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProductionService } from '../src/modules/production/production.service.js';

describe('tenant-scoped production and publication integration', () => {
  const suffix = randomUUID();
  const emailQueue = { enqueue: vi.fn().mockResolvedValue('queued') };
  const production = new ProductionService(emailQueue as never);
  const userIds: string[] = [];
  const fileIds: string[] = [];
  let chiefId = '';
  let authorId = '';
  let copyeditorId = '';
  let productionEditorId = '';
  let outsiderId = '';
  let journalId = '';
  let submissionId = '';
  let versionId = '';
  let publicationId = '';
  let issueId = '';
  beforeAll(async () => {
    const passwordHash = await hash('Production-' + suffix);
    const users = await Promise.all(
      ['chief', 'author', 'copy', 'production', 'outsider'].map((name) =>
        database.user.create({
          data: {
            email: `production-${name}-${suffix}@aksara.local`,
            passwordHash,
            fullName: `Production ${name}`,
            emailVerifiedAt: new Date(),
          },
        }),
      ),
    );
    [chiefId, authorId, copyeditorId, productionEditorId, outsiderId] = users.map(({ id }) => id);
    userIds.push(...users.map(({ id }) => id));
    const journal = await database.journal.create({
      data: {
        slug: 'production-' + suffix,
        title: 'Jurnal Produksi Fiktif',
        abbreviation: 'JPF',
        description: 'Fixture production publication.',
        scope: 'Pengujian copyediting, galley, issue, scheduling, dan publication.',
        contactEmail: users[0]?.email ?? '',
        status: 'PUBLISHED',
        createdById: chiefId,
        memberships: {
          create: [
            { userId: chiefId, role: 'EDITOR_IN_CHIEF' },
            { userId: copyeditorId, role: 'COPYEDITOR' },
            { userId: productionEditorId, role: 'PRODUCTION_EDITOR' },
          ],
        },
        articleTypes: { create: { slug: 'article', title: 'Article', peerReviewRequired: false } },
      },
      include: { articleTypes: true },
    });
    journalId = journal.id;
    const section = await database.journalSection.create({
      data: { journalId, slug: 'research', title: 'Research Articles' },
    });
    await database.articleType.update({
      where: { id: journal.articleTypes[0]!.id },
      data: { sectionId: section.id },
    });
    const submission = await database.submission.create({
      data: {
        journalId,
        submitterId: authorId,
        articleTypeId: journal.articleTypes[0]!.id,
        state: 'ACCEPTED',
        title: 'Artikel produksi yang telah diterima',
        abstract: 'Abstrak artikel fiktif yang cukup panjang untuk validasi metadata publikasi.',
        language: 'id',
        submittedAt: new Date(),
        authors: {
          create: {
            userId: authorId,
            givenName: 'Author',
            familyName: 'Fiktif',
            email: users[1]!.email,
            affiliation: 'Institusi Fiktif',
            isCorresponding: true,
            sortOrder: 0,
          },
        },
      },
    });
    submissionId = submission.id;
    const version = await database.submissionVersion.create({
      data: {
        submissionId,
        version: 1,
        snapshot: {
          title: submission.title,
          abstract: submission.abstract,
          language: 'id',
          authors: [{ givenName: 'Author', familyName: 'Fiktif', affiliation: 'Institusi Fiktif' }],
          keywords: ['produksi'],
        } as Prisma.InputJsonValue,
      },
    });
    versionId = version.id;
    await database.submission.update({
      where: { id: submissionId },
      data: { acceptedVersionId: version.id },
    });
  });
  afterAll(async () => {
    await database.submission.updateMany({
      where: { id: submissionId },
      data: { acceptedVersionId: null },
    });
    await database.publicationUpdate.deleteMany({ where: { publication: { submissionId } } });
    await database.galley.deleteMany({
      where: { publicationVersion: { publication: { submissionId } } },
    });
    await database.publicationVersion.deleteMany({ where: { publication: { submissionId } } });
    await database.publication.deleteMany({ where: { submissionId } });
    await database.productionQuery.deleteMany({ where: { submissionId } });
    await database.productionAssignment.deleteMany({ where: { submissionId } });
    await database.issue.deleteMany({ where: { journalId } });
    await database.submissionAuthor.deleteMany({ where: { submissionId } });
    await database.submissionVersion.deleteMany({ where: { submissionId } });
    await database.submission.deleteMany({ where: { id: submissionId } });
    await database.storedFile.deleteMany({ where: { id: { in: fileIds } } });
    await database.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await database.journal.deleteMany({ where: { id: journalId } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });

  it('requires tenant assignment and keeps author query access resource-scoped', async () => {
    const metadata = {
      slug: 'artikel-produksi',
      title: 'Artikel produksi yang telah diterima',
      abstract: 'Abstrak final untuk artikel produksi yang telah melalui pemeriksaan metadata.',
      authors: [{ givenName: 'Author', familyName: 'Fiktif', affiliation: 'Institusi Fiktif' }],
      keywords: ['produksi'],
      language: 'id',
      licenseName: 'Creative Commons Attribution 4.0 International',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      copyrightHolder: 'Author Fiktif',
    };
    await expect(
      production.prepare(submissionId, outsiderId, metadata, 'production-' + suffix),
    ).resolves.toBeNull();
    await expect(
      production.prepare(submissionId, copyeditorId, metadata, 'production-' + suffix),
    ).resolves.toBeNull();
    await expect(
      production.assign(
        submissionId,
        chiefId,
        { assigneeId: copyeditorId, stage: 'COPYEDITING', note: 'Lakukan copyediting.' },
        'production-' + suffix,
      ),
    ).resolves.toMatchObject({ stage: 'COPYEDITING' });
    const query = await production.openQuery(
      submissionId,
      copyeditorId,
      'Mohon konfirmasi kembali bentuk nama institusi author.',
      'production-' + suffix,
    );
    expect(query).toMatchObject({ status: 'OPEN' });
    if (!query) throw new Error('Query fixture missing.');
    await expect(
      production.answerQuery(
        query.id,
        outsiderId,
        'Jawaban yang tidak sah.',
        'production-' + suffix,
      ),
    ).resolves.toBeNull();
    await expect(
      production.answerQuery(
        query.id,
        authorId,
        'Nama institusi telah benar dan dapat digunakan pada metadata final.',
        'production-' + suffix,
      ),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
    const prepared = await production.prepare(
      submissionId,
      copyeditorId,
      metadata,
      'production-' + suffix,
    );
    expect(prepared).toMatchObject({ version: { version: 1 } });
    if (typeof prepared !== 'object' || !prepared) throw new Error('Publication missing.');
    publicationId = prepared.publication.id;
  });

  it('requires an issue and approved clean public galley before EIC scheduling', async () => {
    const issue = await production.createIssue(
      journalId,
      chiefId,
      {
        slug: 'vol-1-no-1',
        volume: '1',
        number: '1',
        year: 2026,
        title: 'Volume 1 Nomor 1',
        description: 'Issue pengujian.',
      },
      'production-' + suffix,
    );
    expect(issue).not.toBeNull();
    issueId = issue!.id;
    const current = await database.publicationVersion.findFirstOrThrow({
      where: { publicationId },
      orderBy: { version: 'desc' },
    });
    await database.publication.update({ where: { id: publicationId }, data: { issueId } });
    await expect(
      production.schedule(
        publicationId,
        chiefId,
        new Date(Date.now() + 86_400_000),
        'production-' + suffix,
      ),
    ).resolves.toBe('invalid');
    const file = await database.storedFile.create({
      data: {
        journalId,
        uploaderId: productionEditorId,
        storageKey: 'publications/' + suffix + '/galley.pdf',
        originalName: 'article.pdf',
        declaredMime: 'application/pdf',
        detectedMime: 'application/pdf',
        size: 100,
        checksumSha256: 'a'.repeat(64),
        scanStatus: 'CLEAN',
        visibility: 'PUBLIC',
        uploadedAt: new Date(),
        scannedAt: new Date(),
      },
    });
    fileIds.push(file.id);
    await database.galley.create({
      data: {
        publicationVersionId: current.id,
        storedFileId: file.id,
        label: 'PDF',
        format: 'PDF',
        approvedAt: new Date(),
      },
    });
    await database.publicationVersion.update({
      where: { id: current.id },
      data: { doi: '10.9999/aksara.' + suffix },
    });
    await expect(
      production.schedule(
        publicationId,
        productionEditorId,
        new Date(Date.now() + 86_400_000),
        'production-' + suffix,
      ),
    ).resolves.toBeNull();
    await expect(
      production.schedule(
        publicationId,
        chiefId,
        new Date(Date.now() + 86_400_000),
        'production-' + suffix,
      ),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });
  });

  it('publishes idempotently to a stable public record and preserves withdrawal notice', async () => {
    await database.publication.update({
      where: { id: publicationId },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    const key = 'publication-' + suffix;
    const first = await production.publish(publicationId, chiefId, key, 'production-' + suffix);
    expect(first).toMatchObject({ status: 'PUBLISHED' });
    await expect(
      production.publish(publicationId, chiefId, key, 'production-' + suffix),
    ).resolves.toMatchObject({ id: publicationId });
    await expect(
      production.publish(publicationId, chiefId, 'different-key-' + suffix, 'production-' + suffix),
    ).resolves.toBe('key-conflict');
    const article = await production.publicArticle('production-' + suffix, 'artikel-produksi');
    expect(article?.versions[0]?.galleys).toHaveLength(1);
    expect(JSON.stringify(article)).not.toContain('storageKey');
    expect(JSON.stringify(article?.versions)).not.toContain('@aksara.local');
    expect(JSON.stringify(article)).not.toContain('createdById');
    expect(JSON.stringify(article)).not.toContain('sourceVersionId');
    expect(JSON.stringify(article)).not.toContain('publicationKey');
    await expect(
      production.listPublic({
        query: '10.9999/aksara.' + suffix,
        journal: 'production-' + suffix,
        section: 'research',
        articleType: 'article',
        issue: 'vol-1-no-1',
        year: 2026,
      }),
    ).resolves.toHaveLength(1);
    await expect(production.listPublic({ year: 1900 })).resolves.toHaveLength(0);
    await expect(production.publicSearchFacets()).resolves.toMatchObject({
      journals: expect.arrayContaining([
        { slug: 'production-' + suffix, title: 'Jurnal Produksi Fiktif' },
      ]),
    });
    await expect(
      production.recordUpdate(
        publicationId,
        productionEditorId,
        {
          type: 'WITHDRAWAL',
          reason: 'Alasan penarikan yang cukup panjang untuk audit.',
          notice: 'Artikel ini ditarik secara transparan dan rekam publiknya tetap tersedia.',
        },
        'production-' + suffix,
      ),
    ).resolves.toBeNull();
    await expect(
      production.recordUpdate(
        publicationId,
        chiefId,
        {
          type: 'WITHDRAWAL',
          reason: 'Alasan penarikan yang cukup panjang untuk audit.',
          notice: 'Artikel ini ditarik secara transparan dan rekam publiknya tetap tersedia.',
        },
        'production-' + suffix,
      ),
    ).resolves.toMatchObject({ type: 'WITHDRAWAL' });
    expect(
      await production.publicArticle('production-' + suffix, 'artikel-produksi'),
    ).toMatchObject({ status: 'WITHDRAWN', updates: [{ type: 'WITHDRAWAL' }] });
    expect(await database.issue.findUniqueOrThrow({ where: { id: issueId } })).toMatchObject({
      status: 'PUBLISHED',
    });
    expect(emailQueue.enqueue.mock.calls.map(([job]) => job.event)).toEqual([
      'production.assignment-created',
      'production.query-opened',
      'publication.scheduled',
      'publication.published',
    ]);
  });
});
