import { randomUUID } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { database } from '../../packages/database/src/index.js';
import { processFileScan } from '../../workers/jobs/src/file-scan.js';

const suffix = randomUUID();
const email = `browser-author-${suffix}@aksara.local`;
const password = `Browser-E2E-${suffix}`;
const journalTitle = `Jurnal Browser Fiktif ${suffix.slice(0, 8)}`;
const apiBaseUrl = 'http://127.0.0.1:3101/api/v1';
let userId = '';
let journalId = '';
let articleTypeId = '';
let storageKey = '';

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the submission E2E test.`);
  return value;
}

test.beforeAll(async ({ request }) => {
  const abandonedFixtures = await database.user.findMany({
    where: {
      email: { startsWith: 'browser-author-' },
      journalsCreated: { none: {} },
      submissions: { none: {} },
      filesUploaded: { none: {} },
    },
    select: { id: true },
  });
  const abandonedIds = abandonedFixtures.map(({ id }) => id);
  await database.auditEvent.deleteMany({ where: { actorId: { in: abandonedIds } } });
  await database.user.deleteMany({ where: { id: { in: abandonedIds } } });

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { email, password },
  });
  expect(registration.ok()).toBeTruthy();
  const registrationBody = (await registration.json()) as { developmentToken?: string };
  expect(registrationBody.developmentToken).toBeTruthy();
  const verification = await request.post(`${apiBaseUrl}/auth/email-verifications`, {
    data: { token: registrationBody.developmentToken },
  });
  expect(verification.ok()).toBeTruthy();

  const user = await database.user.findUniqueOrThrow({ where: { email } });
  userId = user.id;
  const journal = await database.journal.create({
    data: {
      slug: `browser-e2e-${suffix}`,
      title: journalTitle,
      abbreviation: 'JBEF',
      description: 'Fixture jurnal fiktif untuk pengujian browser.',
      scope: 'Pengujian submission dan penyimpanan privat.',
      contactEmail: email,
      status: 'PUBLISHED',
      submissionsOpen: true,
      createdById: user.id,
      articleTypes: { create: { slug: 'research', title: 'Artikel penelitian' } },
      checklistItems: {
        create: { label: 'Metadata dan format naskah sudah diperiksa.', isRequired: true },
      },
      declarations: {
        create: {
          code: 'originality',
          version: 1,
          title: 'Orisinalitas',
          body: 'Naskah merupakan karya orisinal.',
          isRequired: true,
        },
      },
    },
  });
  journalId = journal.id;
  const articleType = await database.articleType.findFirstOrThrow({ where: { journalId } });
  articleTypeId = articleType.id;
  const publicDetail = await request.get(`${apiBaseUrl}/journals/browser-e2e-${suffix}`);
  expect(publicDetail.ok()).toBeTruthy();
  const publicBody = (await publicDetail.json()) as { articleTypes: Array<{ id: string }> };
  expect(publicBody.articleTypes.map(({ id }) => id)).toContain(articleTypeId);
});

test.afterAll(async () => {
  if (userId && journalId) {
    const submissions = await database.submission.findMany({
      where: { submitterId: userId, journalId },
      select: { id: true },
    });
    const submissionIds = submissions.map(({ id }) => id);
    const storedFiles = await database.storedFile.findMany({
      where: { submissionFile: { submissionId: { in: submissionIds } } },
      select: { id: true, storageKey: true },
    });
    if (storageKey || storedFiles.length) {
      const client = new S3Client({
        endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
        region: requiredEnvironment('OBJECT_STORAGE_REGION'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
          secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
        },
      });
      for (const key of new Set([storageKey, ...storedFiles.map((file) => file.storageKey)]))
        if (key)
          await client.send(
            new DeleteObjectCommand({
              Bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
              Key: key,
            }),
          );
    }
    await database.submissionTimelineEvent.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submissionVersion.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await database.submissionFile.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await database.storedFile.deleteMany({
      where: { id: { in: storedFiles.map(({ id }) => id) } },
    });
    await database.submission.deleteMany({ where: { id: { in: submissionIds } } });
    await database.auditEvent.deleteMany({ where: { actorId: userId } });
    await database.journal.deleteMany({ where: { id: journalId } });
    await database.user.deleteMany({ where: { id: userId } });
  }
  await database.$disconnect();
});

test('author creates, autosaves, uploads, and submits a private manuscript in the browser', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await page.context().cookies()).map(({ name }) => name), {
      timeout: 5_000,
    })
    .toContain('aksara_session');
  await expect(page).toHaveURL(/\/workspace\/profile$/);

  await page.goto('/workspace/submissions/new');
  await expect(page).toHaveURL(/\/workspace\/submissions\/new$/);
  await expect(page.getByRole('heading', { name: 'Pilih jurnal dan jenis artikel' })).toBeVisible();
  await page.getByLabel('Jurnal').selectOption(journalId);
  const articleOptions = await page
    .getByLabel('Jenis artikel')
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(articleOptions).toContain(articleTypeId);
  await page.getByLabel('Jenis artikel').selectOption(articleTypeId);
  await page.getByRole('button', { name: 'Buat draf' }).click();
  await expect(page).toHaveURL(/\/workspace\/submissions\/[0-9a-f-]+$/);

  await page
    .getByLabel('Judul', { exact: true })
    .fill('Validasi Browser untuk Pipeline Submission Privat');
  await page
    .getByLabel('Abstrak')
    .fill(
      'Studi fiktif ini menjelaskan tujuan, metode, hasil, pembahasan, dan simpulan pengujian browser untuk alur submission privat.',
    );
  await page.getByLabel('Kata kunci').fill('browser, submission, keamanan');
  await page.getByLabel('Nama depan').fill('Penulis');
  await page.getByLabel('Nama belakang').fill('Browser');
  await page.getByLabel('Afiliasi').fill('Institut Fiktif Nusantara');
  await page.getByText('Metadata dan format naskah sudah diperiksa.').click();
  await page.getByText('Saya menyetujui versi 1.').click();
  await expect(page.getByText('Semua perubahan tersimpan.')).toBeVisible({ timeout: 10_000 });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);

  await page.getByLabel('Pilih file').setInputFiles({
    name: 'browser-manuscript.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    ),
  });
  const fileRow = page.locator('.file-list li').filter({ hasText: 'browser-manuscript.pdf' });
  await expect(fileRow).toBeVisible({ timeout: 15_000 });
  const submissionId = page.url().split('/').at(-1);
  if (!submissionId) throw new Error('Submission ID was not present in the editor URL.');
  const storedFile = await database.storedFile.findFirstOrThrow({
    where: { submissionFile: { submissionId } },
  });
  storageKey = storedFile.storageKey;
  if (storedFile.scanStatus === 'QUARANTINED')
    await processFileScan(storedFile.id, {
      endpoint: requiredEnvironment('OBJECT_STORAGE_ENDPOINT'),
      region: requiredEnvironment('OBJECT_STORAGE_REGION'),
      bucket: requiredEnvironment('OBJECT_STORAGE_BUCKET_PRIVATE'),
      accessKeyId: requiredEnvironment('OBJECT_STORAGE_ACCESS_KEY'),
      secretAccessKey: requiredEnvironment('OBJECT_STORAGE_SECRET_KEY'),
      antivirusHost: requiredEnvironment('ANTIVIRUS_HOST'),
      antivirusPort: Number(requiredEnvironment('ANTIVIRUS_PORT')),
    });
  await page.reload();
  await expect(
    page.locator('.file-list li').filter({ hasText: 'browser-manuscript.pdf' }).getByText('CLEAN'),
  ).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Kirim submission' }).click();
  await expect(page.getByRole('heading', { name: 'Receipt submission' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Versi pertama telah dibekukan')).toBeVisible();
});
