import { randomUUID } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hash } from 'argon2';
import { database, Prisma } from '../../packages/database/src/index.js';
import { ReviewService } from '../../apps/api/src/modules/reviews/review.service.js';
import { processFileScan } from '../../workers/jobs/src/file-scan.js';

const suffix = randomUUID();
const password = `Review-Browser-${suffix}`;
const chiefEmail = `browser-review-chief-${suffix}@aksara.local`;
const reviewerEmail = `browser-reviewer-${suffix}@aksara.local`;
const authorEmail = `browser-review-author-${suffix}@aksara.local`;
const authorIdentity = `IdentitasRahasia${suffix.slice(0, 6)}`;
let chiefId = '';
let reviewerId = '';
let authorId = '';
let journalId = '';
let submissionId = '';
let invitationId = '';
let invitationToken = '';
let assignmentId = '';
let sourceFileId = '';
let uploadedReviewStorageKey = '';

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the review E2E test.`);
  return value;
}

test.beforeAll(async () => {
  const passwordHash = await hash(password);
  const [chief, reviewer, author] = await Promise.all([
    database.user.create({
      data: {
        email: chiefEmail,
        passwordHash,
        fullName: 'Chief Browser Review',
        emailVerifiedAt: new Date(),
      },
    }),
    database.user.create({
      data: {
        email: reviewerEmail,
        passwordHash,
        fullName: 'Reviewer Browser',
        affiliation: 'Institute Review Fiktif',
        emailVerifiedAt: new Date(),
      },
    }),
    database.user.create({
      data: {
        email: authorEmail,
        passwordHash,
        fullName: authorIdentity,
        emailVerifiedAt: new Date(),
      },
    }),
  ]);
  chiefId = chief.id;
  reviewerId = reviewer.id;
  authorId = author.id;
  const journal = await database.journal.create({
    data: {
      slug: `review-browser-${suffix}`,
      title: `Jurnal Review Browser ${suffix.slice(0, 8)}`,
      abbreviation: 'JRB',
      description: 'Fixture browser untuk reviewer workspace.',
      scope: 'Pengujian anonymity, invitation, review, dan file privat.',
      contactEmail: chiefEmail,
      reviewModel: 'DOUBLE_ANONYMOUS',
      status: 'PUBLISHED',
      submissionsOpen: true,
      createdById: chiefId,
      memberships: {
        create: [
          { userId: chiefId, role: 'EDITOR_IN_CHIEF' },
          { userId: reviewerId, role: 'REVIEWER' },
        ],
      },
      reviewerProfiles: {
        create: {
          userId: reviewerId,
          languages: ['id'],
          expertise: { create: { value: 'peer review' } },
        },
      },
      articleTypes: { create: { slug: 'research', title: 'Artikel penelitian' } },
      reviewForms: {
        create: {
          name: 'Form browser',
          version: 1,
          questions: {
            create: {
              prompt: 'Jelaskan kualitas metode penelitian.',
              type: 'LONG_TEXT',
              required: true,
              sortOrder: 0,
            },
          },
        },
      },
    },
    include: { articleTypes: true, reviewForms: true },
  });
  journalId = journal.id;
  const articleTypeId = journal.articleTypes[0]?.id;
  const reviewFormId = journal.reviewForms[0]?.id;
  if (!articleTypeId || !reviewFormId) throw new Error('Review browser fixture incomplete.');
  const submission = await database.submission.create({
    data: {
      journalId,
      submitterId: authorId,
      articleTypeId,
      state: 'EDITOR_ASSIGNED',
      title: 'Naskah Browser Double Blind',
      abstract: 'Abstrak fiktif untuk menguji penerimaan undangan dan pengiriman peer review.',
      submittedAt: new Date(),
      authors: {
        create: {
          userId: authorId,
          givenName: authorIdentity,
          familyName: 'Tersembunyi',
          email: authorEmail,
          affiliation: 'Afiliasi Rahasia Browser',
          isCorresponding: true,
          sortOrder: 0,
        },
      },
      editorialAssignments: {
        create: {
          journalId,
          editorId: chiefId,
          assignedById: chiefId,
          assignmentNote: 'Assignment fixture browser.',
        },
      },
    },
  });
  submissionId = submission.id;
  const source = await database.storedFile.create({
    data: {
      journalId,
      uploaderId: authorId,
      storageKey: `review-browser/${suffix}/source`,
      originalName: `${authorIdentity}-source.pdf`,
      declaredMime: 'application/pdf',
      detectedMime: 'application/pdf',
      size: 100,
      scanStatus: 'CLEAN',
      visibility: 'PRIVATE',
      uploadedAt: new Date(),
      scannedAt: new Date(),
    },
  });
  sourceFileId = source.id;
  await database.submissionFile.create({
    data: { submissionId, storedFileId: source.id, purpose: 'MANUSCRIPT' },
  });
  await database.submissionVersion.create({
    data: {
      submissionId,
      version: 1,
      snapshot: {
        files: [{ purpose: 'MANUSCRIPT', fileId: source.id, originalName: source.originalName }],
      } as Prisma.InputJsonValue,
    },
  });
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = 'development';
  try {
    const service = new ReviewService(
      { enqueue: async () => 'queued' } as never,
      { enqueue: async () => 'queued' } as never,
    );
    const invited = await service.invite(
      submissionId,
      chiefId,
      {
        reviewerId,
        reviewFormId,
        responseDeadline: new Date(Date.now() + 7 * 86_400_000),
        reviewDeadline: new Date(Date.now() + 21 * 86_400_000),
      },
      `review-browser-${suffix}`,
    );
    if (typeof invited === 'string' || !invited.token)
      throw new Error(`Invitation failed: ${String(invited)}`);
    invitationId = invited.invitation.id;
    invitationToken = invited.token;
  } finally {
    process.env.APP_ENV = previous;
  }
});

test.afterAll(async () => {
  const reviewStoredFiles = submissionId
    ? await database.storedFile.findMany({
        where: { reviewFile: { response: { assignment: { round: { submissionId } } } } },
        select: { id: true, storageKey: true },
      })
    : [];
  const revisionStoredFiles = submissionId
    ? await database.storedFile.findMany({
        where: { submissionFile: { submissionId, revisionId: { not: null } } },
        select: { id: true, storageKey: true },
      })
    : [];
  if (uploadedReviewStorageKey || reviewStoredFiles.length || revisionStoredFiles.length) {
    const client = new S3Client({
      endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
      region: requiredEnvironment('OBJECT_STORAGE_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
        secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
      },
    });
    for (const key of new Set([
      uploadedReviewStorageKey,
      ...reviewStoredFiles.map(({ storageKey }) => storageKey),
      ...revisionStoredFiles.map(({ storageKey }) => storageKey),
    ]))
      if (key)
        await client.send(
          new DeleteObjectCommand({
            Bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
            Key: key,
          }),
        );
  }
  if (submissionId) {
    await database.submission.update({
      where: { id: submissionId },
      data: { acceptedVersionId: null },
    });
    await database.decisionReviewFileRelease.deleteMany({
      where: { decision: { submissionId } },
    });
    await database.decisionReviewRelease.deleteMany({
      where: { decision: { submissionId } },
    });
    await database.decisionLetter.deleteMany({ where: { decision: { submissionId } } });
    await database.reviewAnswer.deleteMany({
      where: { response: { assignment: { round: { submissionId } } } },
    });
    await database.reviewFile.deleteMany({
      where: { response: { assignment: { round: { submissionId } } } },
    });
    await database.reviewResponse.deleteMany({
      where: { assignment: { round: { submissionId } } },
    });
    await database.reviewAssignment.deleteMany({ where: { round: { submissionId } } });
    await database.reviewInvitation.deleteMany({ where: { round: { submissionId } } });
    await database.submissionFile.deleteMany({ where: { submissionId } });
    await database.revision.deleteMany({ where: { submissionId } });
    await database.editorialDecision.deleteMany({ where: { submissionId } });
    await database.reviewRound.deleteMany({ where: { submissionId } });
    await database.editorialAssignment.deleteMany({ where: { submissionId } });
    await database.submissionTimelineEvent.deleteMany({ where: { submissionId } });
    await database.submissionVersion.deleteMany({ where: { submissionId } });
    await database.submissionAuthor.deleteMany({ where: { submissionId } });
    await database.submission.deleteMany({ where: { id: submissionId } });
  }
  await database.storedFile.deleteMany({
    where: {
      id: {
        in: [
          sourceFileId,
          ...reviewStoredFiles.map(({ id }) => id),
          ...revisionStoredFiles.map(({ id }) => id),
        ].filter(Boolean),
      },
    },
  });
  await database.auditEvent.deleteMany({
    where: { actorId: { in: [chiefId, reviewerId, authorId].filter(Boolean) } },
  });
  if (journalId) await database.journal.deleteMany({ where: { id: journalId } });
  await database.user.deleteMany({
    where: { id: { in: [chiefId, reviewerId, authorId].filter(Boolean) } },
  });
  await database.$disconnect();
});

test('reviewer submits anonymously, editor requests revision, and author resubmits version two', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill(reviewerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await page.context().cookies()).map(({ name }) => name))
    .toContain('aksara_session');
  await page.goto(
    `/reviewer/invitations/${invitationId}?token=${encodeURIComponent(invitationToken)}`,
  );
  await expect(page.getByRole('heading', { name: 'Undangan peer review' })).toBeVisible();
  await expect(page.getByText(authorIdentity)).toHaveCount(0);
  await expect(page.getByText(`${authorIdentity}-source.pdf`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Terima undangan' }).click();
  await expect(page).toHaveURL(/\/reviewer\/assignments\/[0-9a-f-]+$/);
  assignmentId = page.url().split('/').at(-1) ?? '';
  await expect(page.getByRole('heading', { name: 'Naskah anonim' })).toBeVisible();
  await expect(page.getByText('manuscript-file-1.pdf')).toBeVisible();
  await expect(page.getByText(authorIdentity)).toHaveCount(0);
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);

  await page.getByLabel('Tandai dapat dirilis kepada author oleh editor').check();
  await page.getByLabel('Pilih file').setInputFiles({
    name: 'review-notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  });
  await expect(page.getByText('review-notes.pdf')).toBeVisible({ timeout: 15_000 });
  const stored = await database.storedFile.findFirstOrThrow({
    where: { reviewFile: { response: { assignmentId } } },
  });
  uploadedReviewStorageKey = stored.storageKey;
  if (stored.scanStatus === 'QUARANTINED')
    await processFileScan(stored.id, {
      endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
      region: requiredEnvironment('OBJECT_STORAGE_REGION'),
      bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
      accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
      secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
      antivirusHost: requiredEnvironment('ANTIVIRUS_HOST'),
      antivirusPort: Number(requiredEnvironment('ANTIVIRUS_PORT')),
    });
  await page.reload();
  await expect(page.getByText('CLEAN')).toBeVisible();
  await page
    .getByLabel('Jelaskan kualitas metode penelitian. *')
    .fill('Metode dijelaskan dengan cukup baik dan dapat direplikasi.');
  await page
    .getByLabel('Komentar untuk author *')
    .fill('Naskah tersusun baik; mohon tambahkan rincian prosedur validasi pada bagian metode.');
  await page
    .getByLabel('Komentar rahasia untuk editor')
    .fill('Tidak ada persoalan etika yang terlihat pada naskah anonim ini.');
  await page.getByLabel('Rekomendasi *').selectOption('MINOR_REVISION');
  await page.getByRole('button', { name: 'Kirim review final' }).click();
  await expect(page.getByRole('status')).toContainText('dikunci');
  await expect(page.getByRole('button', { name: 'Kirim review final' })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(chiefEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await page.context().cookies()).map(({ name }) => name))
    .toContain('aksara_session');
  await page.goto('/editorial/submissions/' + submissionId);
  await page
    .getByLabel('Alasan internal editorial')
    .fill('Metode memerlukan rincian validasi sebelum naskah dapat dipertimbangkan lebih lanjut.');
  await page.getByLabel(/Komentar reviewer 1:/).check();
  await page.getByLabel('File: review-notes.pdf').check();
  await page.getByRole('button', { name: 'Rilis keputusan dan kunci round' }).click();
  await expect(page.getByRole('status')).toContainText('berhasil');

  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(authorEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await page.context().cookies()).map(({ name }) => name))
    .toContain('aksara_session');
  await page.goto('/workspace/submissions/' + submissionId);
  await expect(page.getByRole('heading', { name: 'Keputusan dan komentar review' })).toBeVisible();
  await expect(page.getByText('Naskah tersusun baik; mohon tambahkan rincian')).toBeVisible();
  await expect(page.getByText('Tidak ada persoalan etika')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Kirim revisi' })).toBeVisible();

  await page.getByLabel('Jenis file').selectOption('MANUSCRIPT');
  await page.getByLabel('Pilih file').setInputFiles({
    name: 'revised-manuscript.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nrevised\n%%EOF\n'),
  });
  await expect(page.getByText('revised-manuscript.pdf')).toBeVisible({ timeout: 15_000 });
  let revisionFile = await database.storedFile.findFirstOrThrow({
    where: { submissionFile: { submissionId, revisionId: { not: null }, purpose: 'MANUSCRIPT' } },
  });
  await processFileScan(revisionFile.id, {
    endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
    region: requiredEnvironment('OBJECT_STORAGE_REGION'),
    bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
    accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
    secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
    antivirusHost: requiredEnvironment('ANTIVIRUS_HOST'),
    antivirusPort: Number(requiredEnvironment('ANTIVIRUS_PORT')),
  });
  await page.reload();
  await page.getByLabel('Jenis file').selectOption('RESPONSE');
  await page.getByLabel('Pilih file').setInputFiles({
    name: 'response-to-reviewers.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nresponse\n%%EOF\n'),
  });
  await expect(page.getByText('response-to-reviewers.pdf')).toBeVisible({ timeout: 15_000 });
  revisionFile = await database.storedFile.findFirstOrThrow({
    where: { submissionFile: { submissionId, revisionId: { not: null }, purpose: 'RESPONSE' } },
  });
  await processFileScan(revisionFile.id, {
    endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
    region: requiredEnvironment('OBJECT_STORAGE_REGION'),
    bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
    accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
    secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
    antivirusHost: requiredEnvironment('ANTIVIRUS_HOST'),
    antivirusPort: Number(requiredEnvironment('ANTIVIRUS_PORT')),
  });
  await page.reload();
  await page
    .getByLabel('Tanggapan terstruktur kepada reviewer *')
    .fill(
      'Kami telah menambahkan rincian prosedur validasi dan menjawab setiap komentar reviewer.',
    );
  await page.getByRole('button', { name: 'Kirim versi revisi' }).click();
  await expect(page.getByText('Versi 2', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Revisi versi 2 dikirim ke tim editorial.')).toBeVisible();
});
