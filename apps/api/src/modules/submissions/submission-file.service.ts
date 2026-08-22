import { randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { database } from '@aksara/database';
import { createApiError } from '@aksara/domain';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { FileScanQueue } from './file-scan.queue.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
]);

interface UploadInput {
  originalName: string;
  declaredMime: string;
  size: number;
  purpose: 'MANUSCRIPT' | 'SUPPLEMENTARY' | 'COVER_LETTER' | 'RESPONSE';
}

@Injectable()
export class SubmissionFileService {
  private client: S3Client | undefined;

  constructor(private readonly scans: FileScanQueue) {}

  async authorize(submissionId: string, userId: string, input: UploadInput, requestId: string) {
    const submission = await database.submission.findFirst({
      where: {
        id: submissionId,
        submitterId: userId,
        state: { in: ['DRAFT', 'REVISION_REQUIRED'] },
      },
      select: {
        id: true,
        journalId: true,
        state: true,
        revisions: {
          where: { submittedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!submission) return null;
    const revisionId =
      submission.state === 'REVISION_REQUIRED' ? submission.revisions[0]?.id : undefined;
    if (
      (submission.state === 'DRAFT' && input.purpose === 'RESPONSE') ||
      (submission.state === 'REVISION_REQUIRED' &&
        (!revisionId || input.purpose === 'COVER_LETTER'))
    )
      return 'invalid-file' as const;
    if (input.size < 1 || input.size > MAX_FILE_SIZE || !ALLOWED_MIME_TYPES.has(input.declaredMime))
      return 'invalid-file' as const;

    const storageKey = [
      'journals',
      submission.journalId,
      'submissions',
      submission.id,
      randomUUID(),
    ].join('/');
    const bucket = this.privateBucket(requestId);
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(
        this.s3(requestId),
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          ContentType: input.declaredMime,
          ContentLength: input.size,
          Metadata: { 'original-name': encodeURIComponent(input.originalName) },
        }),
        { expiresIn: 600 },
      );
    } catch {
      throw new ServiceUnavailableException(
        createApiError('OBJECT_STORAGE_UNAVAILABLE', 'Penyimpanan file belum tersedia.', requestId),
      );
    }

    const file = await database.$transaction(async (transaction) => {
      const stored = await transaction.storedFile.create({
        data: {
          journalId: submission.journalId,
          uploaderId: userId,
          storageKey,
          originalName: input.originalName,
          declaredMime: input.declaredMime,
          size: input.size,
          visibility: 'PRIVATE',
        },
      });
      await transaction.submissionFile.create({
        data: {
          submissionId,
          storedFileId: stored.id,
          purpose: input.purpose,
          sortOrder: 0,
          revisionId,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'submission.file_upload_authorized',
          targetType: 'StoredFile',
          targetId: stored.id,
          requestId,
          metadata: {
            submissionId,
            journalId: submission.journalId,
            purpose: input.purpose,
            size: input.size,
          },
        },
      });
      return stored;
    });
    return {
      fileId: file.id,
      uploadUrl,
      expiresInSeconds: 600,
      requiredHeaders: { 'content-type': input.declaredMime },
    };
  }

  async complete(submissionId: string, fileId: string, userId: string, requestId: string) {
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: userId,
        scanStatus: 'AWAITING_UPLOAD',
      },
      include: {
        submissionFile: {
          include: {
            submission: { select: { submitterId: true, state: true } },
            revision: { select: { submittedAt: true } },
          },
        },
      },
    });
    const linked = file?.submissionFile;
    const editable =
      linked?.submissionId === submissionId &&
      linked.submission.submitterId === userId &&
      ((linked.submission.state === 'DRAFT' && !linked.revisionId) ||
        (linked.submission.state === 'REVISION_REQUIRED' &&
          Boolean(linked.revisionId) &&
          !linked.revision?.submittedAt));
    if (!file || !editable) return null;
    const metadata = {
      journalId: file.journalId,
      storageKey: file.storageKey,
      size: file.size,
      declaredMime: file.declaredMime,
    };
    let head;
    try {
      head = await this.s3(requestId).send(
        new HeadObjectCommand({
          Bucket: this.privateBucket(requestId),
          Key: metadata.storageKey,
        }),
      );
    } catch {
      return 'upload-not-found' as const;
    }
    if (head.ContentLength !== metadata.size || head.ContentType !== metadata.declaredMime) {
      await database.storedFile.update({
        where: { id: file.id },
        data: { scanStatus: 'REJECTED', uploadedAt: new Date() },
      });
      return 'metadata-mismatch' as const;
    }
    const now = new Date();
    await database.$transaction([
      database.storedFile.update({
        where: { id: file.id },
        data: { scanStatus: 'QUARANTINED', uploadedAt: now },
      }),
      database.auditEvent.create({
        data: {
          actorId: userId,
          action: 'submission.file_quarantined',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId,
          metadata: { submissionId, journalId: metadata.journalId },
        },
      }),
    ]);
    const scanQueueState = await this.scans.enqueue({
      fileId: file.id,
      journalId: metadata.journalId,
      requestId,
      requestedAt: now.toISOString(),
    });
    return { fileId: file.id, scanStatus: 'QUARANTINED' as const, scanQueueState };
  }

  async remove(submissionId: string, fileId: string, userId: string, requestId: string) {
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: userId,
      },
      include: {
        submissionFile: {
          include: {
            submission: { select: { submitterId: true, state: true } },
            revision: { select: { submittedAt: true } },
          },
        },
      },
    });
    const linked = file?.submissionFile;
    const editable =
      linked?.submissionId === submissionId &&
      linked.submission.submitterId === userId &&
      ((linked.submission.state === 'DRAFT' && !linked.revisionId) ||
        (linked.submission.state === 'REVISION_REQUIRED' &&
          Boolean(linked.revisionId) &&
          !linked.revision?.submittedAt));
    if (!file || !editable) return false;
    await this.s3(requestId).send(
      new DeleteObjectCommand({
        Bucket: this.privateBucket(requestId),
        Key: file.storageKey,
      }),
    );
    await database.$transaction(async (transaction) => {
      await transaction.submissionFile.delete({ where: { storedFileId: file.id } });
      await transaction.storedFile.delete({ where: { id: file.id } });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'submission.file_removed',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId,
          metadata: { submissionId, journalId: file.journalId },
        },
      });
    });
    return true;
  }

  private privateBucket(requestId: string) {
    const bucket = process.env.OBJECT_STORAGE_BUCKET_PRIVATE;
    if (!bucket)
      throw new ServiceUnavailableException(
        createApiError(
          'OBJECT_STORAGE_NOT_CONFIGURED',
          'Penyimpanan belum dikonfigurasi.',
          requestId,
        ),
      );
    return bucket;
  }

  private s3(requestId: string) {
    if (this.client) return this.client;
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const region = process.env.OBJECT_STORAGE_REGION;
    const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    if (!endpoint || !region || !accessKeyId || !secretAccessKey)
      throw new ServiceUnavailableException(
        createApiError(
          'OBJECT_STORAGE_NOT_CONFIGURED',
          'Penyimpanan belum dikonfigurasi.',
          requestId,
        ),
      );
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
