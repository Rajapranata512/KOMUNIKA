import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hash } from 'argon2';
import { database, Prisma } from '../../packages/database/src/index.js';
import { processFileScan } from '../../workers/jobs/src/file-scan.js';

const suffix = randomUUID();
const password = 'Production-Browser-' + suffix;
const chiefEmail = `production-browser-chief-${suffix}@aksara.local`;
const authorEmail = `production-browser-author-${suffix}@aksara.local`;
let chiefId = '';
let authorId = '';
let journalId = '';
let submissionId = '';
const storageKeys: string[] = [];
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' required');
  return value;
}
async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

test.beforeAll(async () => {
  const passwordHash = await hash(password);
  const [chief, author] = await Promise.all([
    database.user.create({
      data: {
        email: chiefEmail,
        passwordHash,
        fullName: 'Chief Production Browser',
        emailVerifiedAt: new Date(),
      },
    }),
    database.user.create({
      data: {
        email: authorEmail,
        passwordHash,
        fullName: 'Author Production Browser',
        emailVerifiedAt: new Date(),
      },
    }),
  ]);
  chiefId = chief.id;
  authorId = author.id;
  const journal = await database.journal.create({
    data: {
      slug: 'production-browser-' + suffix,
      title: 'Jurnal Production Browser',
      abbreviation: 'JPB',
      description: 'Jurnal fiktif untuk browser production.',
      scope: 'Pengujian production, publication, galley, dan public article.',
      contactEmail: chiefEmail,
      status: 'PUBLISHED',
      createdById: chiefId,
      memberships: { create: { userId: chiefId, role: 'EDITOR_IN_CHIEF' } },
      articleTypes: {
        create: { slug: 'article', title: 'Artikel penelitian', peerReviewRequired: false },
      },
    },
    include: { articleTypes: true },
  });
  journalId = journal.id;
  const submission = await database.submission.create({
    data: {
      journalId,
      submitterId: authorId,
      articleTypeId: journal.articleTypes[0]!.id,
      state: 'ACCEPTED',
      title: 'Artikel Browser Siap Produksi',
      abstract: 'Abstrak artikel browser yang telah diterima dan siap diproses untuk publikasi.',
      language: 'id',
      submittedAt: new Date(),
      authors: {
        create: {
          userId: authorId,
          givenName: 'Author',
          familyName: 'Browser',
          email: authorEmail,
          affiliation: 'Institusi Browser Fiktif',
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
        authors: [
          { givenName: 'Author', familyName: 'Browser', affiliation: 'Institusi Browser Fiktif' },
        ],
        keywords: ['browser'],
        files: [],
      } as Prisma.InputJsonValue,
    },
  });
  await database.submission.update({
    where: { id: submissionId },
    data: { acceptedVersionId: version.id },
  });
});

test.afterAll(async () => {
  const client = new S3Client({
    endpoint: required('OBJECT_STORAGE_ENDPOINT'),
    region: required('OBJECT_STORAGE_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY'),
      secretAccessKey: required('OBJECT_STORAGE_SECRET_KEY'),
    },
  });
  for (const key of storageKeys)
    await Promise.all(
      ['OBJECT_STORAGE_BUCKET_PRIVATE', 'OBJECT_STORAGE_BUCKET_PUBLIC'].map(async (bucket) => {
        try {
          await client.send(new DeleteObjectCommand({ Bucket: required(bucket), Key: key }));
        } catch {}
      }),
    );
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
  await database.submissionFile.deleteMany({ where: { submissionId } });
  await database.submissionAuthor.deleteMany({ where: { submissionId } });
  await database.submissionVersion.deleteMany({ where: { submissionId } });
  await database.submission.deleteMany({ where: { id: submissionId } });
  await database.storedFile.deleteMany({ where: { journalId } });
  await database.auditEvent.deleteMany({ where: { actorId: { in: [chiefId, authorId] } } });
  await database.journal.deleteMany({ where: { id: journalId } });
  await database.user.deleteMany({ where: { id: { in: [chiefId, authorId] } } });
  await database.$disconnect();
});

test('EIC prepares, scans, approves, schedules, and publishes a public article', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, chiefEmail);
  await page.goto('/production');
  await page.getByRole('link', { name: 'Buka' }).click();
  await expect(page.getByRole('heading', { name: 'Artikel Browser Siap Produksi' })).toBeVisible();
  await page.getByLabel('Upload source copyediting privat').setInputFiles({
    name: 'copyedited-source.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Source copyediting fiktif yang hanya boleh dibaca pihak berwenang.'),
  });
  await expect(page.getByText(/File dikarantina/)).toBeVisible();
  const sourceFile = await expect
    .poll(
      async () =>
        database.storedFile.findFirst({
          where: { submissionFile: { submissionId, purpose: 'COPYEDITED_SOURCE' } },
        }),
      { timeout: 20_000 },
    )
    .not.toBeNull()
    .then(async () =>
      database.storedFile.findFirstOrThrow({
        where: { submissionFile: { submissionId, purpose: 'COPYEDITED_SOURCE' } },
      }),
    );
  storageKeys.push(sourceFile.storageKey);
  await processFileScan(sourceFile.id, {
    endpoint: required('OBJECT_STORAGE_ENDPOINT'),
    region: required('OBJECT_STORAGE_REGION'),
    bucket: required('OBJECT_STORAGE_BUCKET_PRIVATE'),
    accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY'),
    secretAccessKey: required('OBJECT_STORAGE_SECRET_KEY'),
    antivirusHost: required('ANTIVIRUS_HOST'),
    antivirusPort: Number(required('ANTIVIRUS_PORT')),
  });
  await page.reload();
  await expect(page.getByRole('link', { name: 'copyedited-source.txt' })).toBeVisible();
  await expect(page.getByText(/CLEAN .* privat/)).toBeVisible();
  await page
    .locator('form')
    .filter({ hasText: 'Buat issue' })
    .getByLabel('Slug')
    .fill('volume-1-nomor-1');
  await page.locator('form').filter({ hasText: 'Buat issue' }).getByLabel('Volume').fill('1');
  await page.locator('form').filter({ hasText: 'Buat issue' }).getByLabel('Nomor').fill('1');
  await page
    .locator('form')
    .filter({ hasText: 'Buat issue' })
    .getByLabel('Judul issue')
    .fill('Volume 1 Nomor 1');
  await page.getByRole('button', { name: 'Buat issue' }).click();
  await expect(page.getByText('Perubahan produksi berhasil disimpan.')).toBeVisible();
  const metadata = page.locator('form').filter({ hasText: 'Simpan versi metadata' });
  await metadata.getByLabel('Slug artikel').fill('artikel-browser-siap-produksi');
  await metadata.getByLabel('Issue').selectOption({ index: 1 });
  await metadata.getByLabel('Pemegang hak cipta').fill('Author Browser');
  await metadata.getByRole('button', { name: 'Simpan versi metadata' }).click();
  await expect(page.getByText('Perubahan produksi berhasil disimpan.')).toBeVisible();
  const cover = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('Upload sampul edisi')
    .setInputFiles({ name: 'issue-cover.png', mimeType: 'image/png', buffer: cover });
  await expect(page.getByText(/Sampul dikarantina/)).toBeVisible();
  const coverFile = await expect
    .poll(async () => database.storedFile.findFirst({ where: { issueCover: { journalId } } }), {
      timeout: 20_000,
    })
    .not.toBeNull()
    .then(async () =>
      database.storedFile.findFirstOrThrow({ where: { issueCover: { journalId } } }),
    );
  storageKeys.push(coverFile.storageKey);
  await processFileScan(coverFile.id, {
    endpoint: required('OBJECT_STORAGE_ENDPOINT'),
    region: required('OBJECT_STORAGE_REGION'),
    bucket: required('OBJECT_STORAGE_BUCKET_PRIVATE'),
    accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY'),
    secretAccessKey: required('OBJECT_STORAGE_SECRET_KEY'),
    antivirusHost: required('ANTIVIRUS_HOST'),
    antivirusPort: Number(required('ANTIVIRUS_PORT')),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Setujui sampul publik' }).click();
  await expect(page.getByText(/CLEAN .* PUBLIC/)).toBeVisible();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  await page
    .getByLabel('Upload galley PDF')
    .setInputFiles({ name: 'article-browser.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText(/dikarantina/)).toBeVisible();
  const file = await expect
    .poll(
      async () =>
        database.storedFile.findFirst({
          where: { galley: { publicationVersion: { publication: { submissionId } } } },
        }),
      { timeout: 20_000 },
    )
    .not.toBeNull()
    .then(async () =>
      database.storedFile.findFirstOrThrow({
        where: { galley: { publicationVersion: { publication: { submissionId } } } },
      }),
    );
  storageKeys.push(file.storageKey);
  await processFileScan(file.id, {
    endpoint: required('OBJECT_STORAGE_ENDPOINT'),
    region: required('OBJECT_STORAGE_REGION'),
    bucket: required('OBJECT_STORAGE_BUCKET_PRIVATE'),
    accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY'),
    secretAccessKey: required('OBJECT_STORAGE_SECRET_KEY'),
    antivirusHost: required('ANTIVIRUS_HOST'),
    antivirusPort: Number(required('ANTIVIRUS_PORT')),
  });
  await page.reload();
  await expect(page.getByText(/CLEAN · PRIVATE/)).toBeVisible();
  await page.getByRole('button', { name: 'Setujui galley publik' }).click();
  await expect(
    page
      .locator('li')
      .filter({ hasText: 'article-browser.pdf' })
      .getByText(/CLEAN · PUBLIC/),
  ).toBeVisible();
  const violations = await new AxeBuilder({ page }).analyze();
  expect(
    violations.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);
  const schedule = page.locator('form').filter({ hasText: 'Jadwalkan publikasi' });
  await schedule
    .getByLabel('Jadwal terbit (UTC)')
    .fill(new Date(Date.now() + 60_000).toISOString().slice(0, 16));
  await schedule.getByRole('button', { name: 'Jadwalkan publikasi' }).click();
  await expect
    .poll(async () => (await database.publication.findFirst({ where: { submissionId } }))?.status)
    .toBe('SCHEDULED');
  const publication = await database.publication.findFirstOrThrow({ where: { submissionId } });
  await database.publication.update({
    where: { id: publication.id },
    data: { scheduledAt: new Date(Date.now() - 1000) },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Publikasikan saat jadwal tercapai' }).click();
  await expect
    .poll(
      async () =>
        (await database.publication.findUnique({ where: { id: publication.id } }))?.status,
    )
    .toBe('PUBLISHED');
  const publicApiUrl =
    'http://127.0.0.1:3101/api/v1/public/articles/production-browser-' +
    suffix +
    '/artikel-browser-siap-produksi';
  await expect.poll(async () => (await page.request.get(publicApiUrl)).status()).toBe(200);
  await page.goto(
    '/journals/production-browser-' + suffix + '/articles/artikel-browser-siap-produksi',
  );
  await expect(page.getByRole('heading', { name: 'Artikel Browser Siap Produksi' })).toBeVisible();
  await expect(page.getByText('Author Browser')).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'PDF (PDF)' })).toBeVisible();
  await page.goto('/journals/production-browser-' + suffix + '/issues/volume-1-nomor-1');
  await expect(page.getByAltText('Sampul Volume 1 Nomor 1')).toBeVisible();
});
