import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hash } from 'argon2';

import { JournalService } from '../src/modules/journals/journal.service.js';
import { FileScanQueue } from '../src/modules/submissions/file-scan.queue.js';
import { SubmissionFileService } from '../src/modules/submissions/submission-file.service.js';
import { SubmissionService } from '../src/modules/submissions/submission.service.js';

const suffix = randomUUID();
const requestId = `storage-smoke-${suffix}`;
const journals = new JournalService();
const submissions = new SubmissionService();
const scans = new FileScanQueue();
const files = new SubmissionFileService(scans);
let userId = '';
let journalId = '';
let submissionId = '';
let storedFileId = '';
let storageKey = '';

async function run() {
  const user = await database.user.create({
    data: {
      email: `storage-smoke-${suffix}@aksara.local`,
      passwordHash: await hash(`Storage-Smoke-${suffix}`),
      fullName: 'Penulis Uji Storage',
      affiliation: 'Institut Fiktif Nusantara',
      emailVerifiedAt: new Date(),
    },
  });
  userId = user.id;
  const journal = await journals.create(
    {
      slug: `storage-smoke-${suffix}`,
      title: 'Jurnal Uji Storage Fiktif',
      abbreviation: 'JUSF',
      description: 'Jurnal fiktif untuk smoke test pipeline penyimpanan privat.',
      scope: 'Validasi upload, quarantine, antivirus, finalisasi, dan audit submission.',
      contactEmail: user.email,
      primaryLanguage: 'id',
      reviewModel: 'DOUBLE_ANONYMOUS',
      status: 'PUBLISHED',
      submissionsOpen: true,
    },
    user.id,
    requestId,
  );
  journalId = journal.id;
  const articleType = await journals.createArticleType(
    journal.id,
    { slug: 'research', title: 'Artikel penelitian' },
    user.id,
    requestId,
  );
  if (typeof articleType === 'string') throw new Error('article type fixture failed');
  const declaration = await journals.createDeclaration(
    journal.id,
    {
      code: 'originality',
      title: 'Orisinalitas',
      body: 'Penulis menyatakan naskah ini merupakan karya orisinal dan tidak sedang diproses jurnal lain.',
    },
    user.id,
    requestId,
  );
  if (typeof declaration === 'string') throw new Error('declaration fixture failed');
  const checklist = await journals.createChecklistItem(
    journal.id,
    { label: 'Naskah mengikuti panduan penulis dan seluruh metadata sudah diperiksa.' },
    user.id,
    requestId,
  );
  const draft = await submissions.createDraft(journal.id, articleType.id, user.id, requestId);
  if (!draft) throw new Error('draft fixture failed');
  submissionId = draft.id;
  await submissions.updateDraft(
    draft.id,
    user.id,
    {
      title: 'Smoke Test Pipeline File Privat',
      abstract:
        'Abstrak fiktif ini menjelaskan tujuan, metode, hasil, pembahasan, dan simpulan smoke test pipeline file privat secara lengkap.',
      keywords: ['storage', 'security'],
      authors: [
        {
          givenName: 'Penulis',
          familyName: 'Uji',
          email: user.email,
          affiliation: 'Institut Fiktif Nusantara',
          isCorresponding: true,
        },
      ],
      declarationAcceptances: [{ declarationId: declaration.id, accepted: true }],
      checklistAcceptances: [{ checklistItemId: checklist.id, accepted: true }],
    },
    requestId,
  );

  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  );
  const authorization = await files.authorize(
    draft.id,
    user.id,
    {
      originalName: 'smoke-manuscript.pdf',
      declaredMime: 'application/pdf',
      size: pdf.length,
      purpose: 'MANUSCRIPT',
    },
    requestId,
  );
  if (!authorization || typeof authorization === 'string')
    throw new Error('upload authorization failed');
  storedFileId = authorization.fileId;
  const stored = await database.storedFile.findUniqueOrThrow({
    where: { id: storedFileId },
    select: { storageKey: true },
  });
  storageKey = stored.storageKey;
  const uploaded = await fetch(authorization.uploadUrl, {
    method: 'PUT',
    headers: authorization.requiredHeaders,
    body: pdf,
  });
  if (!uploaded.ok) throw new Error(`presigned upload failed: ${uploaded.status}`);
  const completed = await files.complete(draft.id, storedFileId, user.id, requestId);
  if (!completed || typeof completed === 'string') throw new Error('upload completion failed');

  let scanStatus = 'QUARANTINED';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await database.storedFile.findUniqueOrThrow({
      where: { id: storedFileId },
      select: { scanStatus: true },
    });
    scanStatus = current.scanStatus;
    if (scanStatus !== 'QUARANTINED') break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (scanStatus !== 'CLEAN') throw new Error(`file scan ended as ${scanStatus}`);
  const finalized = await submissions.finalize(
    draft.id,
    user.id,
    `storage-smoke-finalize-${suffix}`,
    requestId,
  );
  if (!finalized || typeof finalized === 'string' || !('state' in finalized))
    throw new Error('submission finalization failed');
  if (finalized.state !== 'SUBMITTED') throw new Error('submission was not submitted');
  console.log(
    JSON.stringify({ event: 'storage.smoke_passed', state: finalized.state, scanStatus }),
  );
}

async function cleanup() {
  if (storageKey) {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const region = process.env.OBJECT_STORAGE_REGION;
    const bucket = process.env.OBJECT_STORAGE_BUCKET_PRIVATE;
    const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    if (endpoint && region && bucket && accessKeyId && secretAccessKey)
      await new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: { accessKeyId, secretAccessKey },
      }).send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
  }
  if (submissionId) {
    await database.submissionTimelineEvent.deleteMany({ where: { submissionId } });
    await database.submissionVersion.deleteMany({ where: { submissionId } });
    await database.submissionFile.deleteMany({ where: { submissionId } });
  }
  if (storedFileId) await database.storedFile.deleteMany({ where: { id: storedFileId } });
  if (submissionId) await database.submission.deleteMany({ where: { id: submissionId } });
  if (journalId) await database.journal.deleteMany({ where: { id: journalId } });
  await database.auditEvent.deleteMany({ where: { requestId } });
  if (userId) await database.user.deleteMany({ where: { id: userId } });
  await scans.onApplicationShutdown();
  await database.$disconnect();
}

async function main() {
  try {
    await run();
  } finally {
    await cleanup();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Storage smoke test failed.');
  process.exitCode = 1;
});
