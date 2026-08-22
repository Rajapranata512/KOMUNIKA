import { randomUUID } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { hash } from 'argon2';
import { database } from '../../packages/database/src/index.js';

const suffix = randomUUID();
const password = `Editorial-Browser-${suffix}`;
const chiefEmail = `browser-chief-${suffix}@aksara.local`;
const authorEmail = `browser-editorial-author-${suffix}@aksara.local`;
const manuscriptTitle = `Screening editorial browser ${suffix.slice(0, 8)}`;
let chiefId = '';
let authorId = '';
let journalId = '';
let submissionId = '';

test.beforeAll(async () => {
  const passwordHash = await hash(password);
  const [chief, author] = await Promise.all([
    database.user.create({
      data: {
        email: chiefEmail,
        passwordHash,
        fullName: 'Editor Browser',
        emailVerifiedAt: new Date(),
      },
    }),
    database.user.create({
      data: {
        email: authorEmail,
        passwordHash,
        fullName: 'Author Browser',
        emailVerifiedAt: new Date(),
      },
    }),
  ]);
  chiefId = chief.id;
  authorId = author.id;
  const journal = await database.journal.create({
    data: {
      slug: `editorial-browser-${suffix}`,
      title: `Jurnal Editorial Browser ${suffix.slice(0, 8)}`,
      abbreviation: 'JEB',
      description: 'Fixture jurnal fiktif untuk alur screening browser.',
      scope: 'Pengujian workflow editorial dan isolasi data.',
      contactEmail: chiefEmail,
      status: 'PUBLISHED',
      submissionsOpen: true,
      createdById: chiefId,
      memberships: { create: { userId: chiefId, role: 'EDITOR_IN_CHIEF' } },
      articleTypes: { create: { slug: 'research', title: 'Artikel penelitian' } },
    },
    include: { articleTypes: true },
  });
  journalId = journal.id;
  const articleTypeId = journal.articleTypes[0]?.id;
  if (!articleTypeId) throw new Error('Article type fixture was not created.');
  const submission = await database.submission.create({
    data: {
      journalId,
      submitterId: authorId,
      articleTypeId,
      state: 'SUBMITTED',
      title: manuscriptTitle,
      abstract: 'Abstrak fiktif lengkap untuk validasi screening editorial melalui browser.',
      coverLetter: 'Mohon pertimbangkan naskah fiktif ini untuk pengujian.',
      submittedAt: new Date(),
      authors: {
        create: {
          userId: authorId,
          givenName: 'Author',
          familyName: 'Browser',
          email: authorEmail,
          affiliation: 'Institut Fiktif Nusantara',
          isCorresponding: true,
          sortOrder: 0,
        },
      },
    },
  });
  submissionId = submission.id;
});

test.afterAll(async () => {
  if (submissionId) {
    await database.internalEditorialNote.deleteMany({ where: { submissionId } });
    await database.screeningDecision.deleteMany({ where: { submissionId } });
    await database.screeningAssessment.deleteMany({ where: { submissionId } });
    await database.editorialAssignment.deleteMany({ where: { submissionId } });
    await database.submissionTimelineEvent.deleteMany({ where: { submissionId } });
    await database.submissionAuthor.deleteMany({ where: { submissionId } });
    await database.submission.deleteMany({ where: { id: submissionId } });
  }
  if (chiefId || authorId)
    await database.auditEvent.deleteMany({
      where: { actorId: { in: [chiefId, authorId].filter(Boolean) } },
    });
  if (journalId) await database.journal.deleteMany({ where: { id: journalId } });
  if (chiefId || authorId)
    await database.user.deleteMany({ where: { id: { in: [chiefId, authorId].filter(Boolean) } } });
  await database.$disconnect();
});

test('editor screens a submission and author sees only the released correction letter', async ({
  browser,
}) => {
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await editorPage.goto('/login');
  await editorPage.getByLabel('Email').fill(chiefEmail);
  await editorPage.getByLabel('Password').fill(password);
  await editorPage.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await editorContext.cookies()).map(({ name }) => name))
    .toContain('aksara_session');

  await editorPage.goto(`/editorial?journalId=${journalId}`);
  await expect(editorPage.getByRole('heading', { name: 'Queue screening' })).toBeVisible();
  await expect(editorPage.getByText(manuscriptTitle)).toBeVisible();
  await editorPage.getByRole('link', { name: 'Buka' }).click();
  await expect(editorPage.getByRole('heading', { name: manuscriptTitle })).toBeVisible();
  const accessibility = await new AxeBuilder({ page: editorPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);

  await editorPage.getByText('Metadata, deklarasi, dan file lengkap').click();
  await editorPage.getByText('Topik sesuai scope jurnal').click();
  await editorPage.getByText('Kebijakan editorial terpenuhi').click();
  await editorPage
    .getByLabel('Catatan screening internal')
    .fill('Catatan rahasia yang hanya dapat dibaca tim editorial.');
  await editorPage.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
  await expect(editorPage.getByRole('status')).toContainText('berhasil dicatat');

  await editorPage
    .getByLabel('Alasan editorial')
    .fill('Metadata afiliasi perlu diperjelas sebelum proses review dapat dimulai.');
  await editorPage
    .getByLabel('Surat untuk author')
    .fill('Mohon perjelas metadata afiliasi penulis sebelum naskah diproses ke tahap peer review.');
  await editorPage.getByLabel('Perubahan wajib').fill('Perjelas afiliasi penulis');
  await editorPage.getByRole('button', { name: 'Catat dan rilis keputusan' }).click();
  await expect(editorPage.getByRole('status')).toContainText('berhasil dicatat');
  await editorContext.close();

  const authorContext = await browser.newContext();
  const authorPage = await authorContext.newPage();
  await authorPage.goto('/login');
  await authorPage.getByLabel('Email').fill(authorEmail);
  await authorPage.getByLabel('Password').fill(password);
  await authorPage.getByRole('button', { name: 'Masuk' }).click();
  await expect
    .poll(async () => (await authorContext.cookies()).map(({ name }) => name))
    .toContain('aksara_session');
  await authorPage.goto(`/workspace/submissions/${submissionId}`);
  await expect(authorPage.getByRole('heading', { name: 'Keputusan editorial' })).toBeVisible();
  await expect(authorPage.getByText('Perjelas afiliasi penulis')).toBeVisible();
  await expect(
    authorPage.getByText('Catatan rahasia yang hanya dapat dibaca tim editorial.'),
  ).toHaveCount(0);
  await authorContext.close();
});
