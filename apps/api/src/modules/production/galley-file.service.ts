import { randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { database } from '@aksara/database';
import { createApiError } from '@aksara/domain';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileScanQueue } from '../submissions/file-scan.queue.js';

const MIME_BY_FORMAT = {
  PDF: 'application/pdf',
  EPUB: 'application/epub+zip',
  XML: 'application/xml',
} as const;
const SOURCE_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
]);
const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
type Format = keyof typeof MIME_BY_FORMAT;

@Injectable()
export class GalleyFileService {
  private client?: S3Client;
  constructor(private readonly scans: FileScanQueue) {}

  private async editable(versionId: string, actorId: string) {
    const version = await database.publicationVersion.findUnique({
      where: { id: versionId },
      include: { publication: true },
    });
    if (!version || version.publication.status !== 'DRAFT') return null;
    const membership = await database.journalMembership.findFirst({
      where: {
        journalId: version.journalId,
        userId: actorId,
        role: { in: ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'] },
      },
    });
    if (membership) return version;
    const assignment = await database.productionAssignment.findFirst({
      where: {
        submissionId: version.publication.submissionId,
        assigneeId: actorId,
        stage: 'PRODUCTION',
        active: true,
      },
    });
    return assignment ? version : null;
  }

  private async editableSource(submissionId: string, actorId: string) {
    const submission = await database.submission.findUnique({ where: { id: submissionId } });
    if (!submission || !['ACCEPTED', 'COPYEDITING', 'PRODUCTION'].includes(submission.state))
      return null;
    const membership = await database.journalMembership.findFirst({
      where: {
        journalId: submission.journalId,
        userId: actorId,
        role: { in: ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'] },
      },
    });
    if (membership) return submission;
    const assignment = await database.productionAssignment.findFirst({
      where: { submissionId, assigneeId: actorId, active: true },
    });
    return assignment ? submission : null;
  }

  private async editableIssue(issueId: string, actorId: string) {
    const issue = await database.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.status === 'PUBLISHED') return null;
    const membership = await database.journalMembership.findFirst({
      where: {
        journalId: issue.journalId,
        userId: actorId,
        role: { in: ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'] },
      },
    });
    return membership ? issue : null;
  }

  async authorizeCover(
    issueId: string,
    actorId: string,
    input: { originalName: string; declaredMime: string; size: number },
    requestId: string,
  ) {
    const issue = await this.editableIssue(issueId, actorId);
    if (
      !issue ||
      input.size < 1 ||
      input.size > 10 * 1024 * 1024 ||
      !COVER_MIME_TYPES.has(input.declaredMime)
    )
      return null;
    const storageKey = [
      'journals',
      issue.journalId,
      'issues',
      issue.id,
      'cover',
      randomUUID(),
    ].join('/');
    const uploadUrl = await getSignedUrl(
      this.s3(requestId),
      new PutObjectCommand({
        Bucket: this.bucket('private', requestId),
        Key: storageKey,
        ContentType: input.declaredMime,
        ContentLength: input.size,
      }),
      { expiresIn: 600 },
    );
    const file = await database.$transaction(async (tx) => {
      const stored = await tx.storedFile.create({
        data: {
          journalId: issue.journalId,
          uploaderId: actorId,
          storageKey,
          originalName: input.originalName,
          declaredMime: input.declaredMime,
          size: input.size,
          visibility: 'PRIVATE',
        },
      });
      await tx.issue.update({ where: { id: issueId }, data: { coverFileId: stored.id } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.issue_cover_upload_authorized',
          targetType: 'StoredFile',
          targetId: stored.id,
          requestId,
          metadata: { journalId: issue.journalId, issueId, size: input.size },
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

  async completeCover(issueId: string, fileId: string, actorId: string, requestId: string) {
    if (!(await this.editableIssue(issueId, actorId))) return null;
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: actorId,
        scanStatus: 'AWAITING_UPLOAD',
        issueCover: { id: issueId },
      },
    });
    if (!file) return null;
    try {
      const head = await this.s3(requestId).send(
        new HeadObjectCommand({ Bucket: this.bucket('private', requestId), Key: file.storageKey }),
      );
      if (head.ContentLength !== file.size || head.ContentType !== file.declaredMime) {
        await database.storedFile.update({
          where: { id: file.id },
          data: { scanStatus: 'REJECTED', uploadedAt: new Date() },
        });
        return 'metadata-mismatch' as const;
      }
    } catch {
      return 'upload-not-found' as const;
    }
    const now = new Date();
    await database.storedFile.update({
      where: { id: file.id },
      data: { scanStatus: 'QUARANTINED', uploadedAt: now },
    });
    const scanQueueState = await this.scans.enqueue({
      fileId: file.id,
      journalId: file.journalId,
      requestId,
      requestedAt: now.toISOString(),
    });
    return { fileId, scanStatus: 'QUARANTINED' as const, scanQueueState };
  }

  async approveCover(issueId: string, actorId: string, requestId: string) {
    const issue = await database.issue.findUnique({
      where: { id: issueId },
      include: { coverFile: true },
    });
    if (!issue?.coverFile || !(await this.editableIssue(issueId, actorId))) return null;
    if (issue.coverFile.scanStatus !== 'CLEAN') return 'not-clean' as const;
    await this.s3(requestId).send(
      new CopyObjectCommand({
        Bucket: this.bucket('public', requestId),
        Key: issue.coverFile.storageKey,
        CopySource: encodeURI(this.bucket('private', requestId) + '/' + issue.coverFile.storageKey),
        ContentType: issue.coverFile.detectedMime ?? issue.coverFile.declaredMime,
        MetadataDirective: 'REPLACE',
      }),
    );
    return database.$transaction(async (tx) => {
      const file = await tx.storedFile.update({
        where: { id: issue.coverFile!.id },
        data: { visibility: 'PUBLIC' },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.issue_cover_approved',
          targetType: 'Issue',
          targetId: issueId,
          requestId,
          metadata: { journalId: issue.journalId, fileId: file.id },
        },
      });
      return file;
    });
  }

  async publicCover(issueId: string) {
    const issue = await database.issue.findFirst({
      where: {
        id: issueId,
        status: 'PUBLISHED',
        coverFile: { visibility: 'PUBLIC', scanStatus: 'CLEAN' },
      },
      include: { coverFile: true },
    });
    if (!issue?.coverFile) return null;
    return {
      url: await getSignedUrl(
        this.s3('public-issue-cover'),
        new GetObjectCommand({
          Bucket: this.bucket('public', 'public-issue-cover'),
          Key: issue.coverFile.storageKey,
        }),
        { expiresIn: 600 },
      ),
    };
  }

  async authorizeSource(
    submissionId: string,
    actorId: string,
    input: { originalName: string; declaredMime: string; size: number },
    requestId: string,
  ) {
    const submission = await this.editableSource(submissionId, actorId);
    if (
      !submission ||
      input.size < 1 ||
      input.size > 25 * 1024 * 1024 ||
      !SOURCE_MIME_TYPES.has(input.declaredMime)
    )
      return null;
    const storageKey = [
      'journals',
      submission.journalId,
      'submissions',
      submission.id,
      'copyediting',
      randomUUID(),
    ].join('/');
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(
        this.s3(requestId),
        new PutObjectCommand({
          Bucket: this.bucket('private', requestId),
          Key: storageKey,
          ContentType: input.declaredMime,
          ContentLength: input.size,
        }),
        { expiresIn: 600 },
      );
    } catch {
      throw new ServiceUnavailableException(
        createApiError('OBJECT_STORAGE_UNAVAILABLE', 'Penyimpanan file belum tersedia.', requestId),
      );
    }
    const stored = await database.$transaction(async (tx) => {
      const file = await tx.storedFile.create({
        data: {
          journalId: submission.journalId,
          uploaderId: actorId,
          storageKey,
          originalName: input.originalName,
          declaredMime: input.declaredMime,
          size: input.size,
          visibility: 'PRIVATE',
        },
      });
      await tx.submissionFile.create({
        data: {
          submissionId,
          storedFileId: file.id,
          purpose: 'COPYEDITED_SOURCE',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.source_upload_authorized',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId,
          metadata: { journalId: submission.journalId, submissionId, size: input.size },
        },
      });
      return file;
    });
    return {
      fileId: stored.id,
      uploadUrl,
      expiresInSeconds: 600,
      requiredHeaders: { 'content-type': input.declaredMime },
    };
  }

  async completeSource(submissionId: string, fileId: string, actorId: string, requestId: string) {
    if (!(await this.editableSource(submissionId, actorId))) return null;
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: actorId,
        scanStatus: 'AWAITING_UPLOAD',
        submissionFile: { submissionId, purpose: 'COPYEDITED_SOURCE' },
      },
    });
    if (!file) return null;
    try {
      const head = await this.s3(requestId).send(
        new HeadObjectCommand({ Bucket: this.bucket('private', requestId), Key: file.storageKey }),
      );
      if (head.ContentLength !== file.size || head.ContentType !== file.declaredMime) {
        await database.storedFile.update({
          where: { id: file.id },
          data: { scanStatus: 'REJECTED', uploadedAt: new Date() },
        });
        return 'metadata-mismatch' as const;
      }
    } catch {
      return 'upload-not-found' as const;
    }
    const now = new Date();
    await database.storedFile.update({
      where: { id: file.id },
      data: { scanStatus: 'QUARANTINED', uploadedAt: now },
    });
    const scanQueueState = await this.scans.enqueue({
      fileId: file.id,
      journalId: file.journalId,
      requestId,
      requestedAt: now.toISOString(),
    });
    return { fileId, scanStatus: 'QUARANTINED' as const, scanQueueState };
  }

  async authorize(
    versionId: string,
    actorId: string,
    input: { originalName: string; size: number; format: Format; label: string; locale: string },
    requestId: string,
  ) {
    const version = await this.editable(versionId, actorId);
    const declaredMime = MIME_BY_FORMAT[input.format];
    if (!version || input.size < 1 || input.size > 50 * 1024 * 1024) return null;
    const storageKey = [
      'journals',
      version.journalId,
      'publications',
      version.publicationId,
      randomUUID(),
    ].join('/');
    let uploadUrl: string;
    try {
      uploadUrl = await getSignedUrl(
        this.s3(requestId),
        new PutObjectCommand({
          Bucket: this.bucket('private', requestId),
          Key: storageKey,
          ContentType: declaredMime,
          ContentLength: input.size,
        }),
        { expiresIn: 600 },
      );
    } catch {
      throw new ServiceUnavailableException(
        createApiError('OBJECT_STORAGE_UNAVAILABLE', 'Penyimpanan file belum tersedia.', requestId),
      );
    }
    const file = await database.$transaction(async (tx) => {
      const stored = await tx.storedFile.create({
        data: {
          journalId: version.journalId,
          uploaderId: actorId,
          storageKey,
          originalName: input.originalName,
          declaredMime,
          size: input.size,
          visibility: 'PRIVATE',
        },
      });
      await tx.galley.create({
        data: {
          publicationVersionId: versionId,
          storedFileId: stored.id,
          label: input.label,
          format: input.format,
          locale: input.locale,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.galley_upload_authorized',
          targetType: 'StoredFile',
          targetId: stored.id,
          requestId,
          metadata: {
            journalId: version.journalId,
            publicationId: version.publicationId,
            format: input.format,
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
      requiredHeaders: { 'content-type': declaredMime },
    };
  }

  async complete(versionId: string, fileId: string, actorId: string, requestId: string) {
    const version = await this.editable(versionId, actorId);
    if (!version) return null;
    const file = await database.storedFile.findFirst({
      where: {
        id: fileId,
        uploaderId: actorId,
        scanStatus: 'AWAITING_UPLOAD',
        galley: { publicationVersionId: versionId },
      },
    });
    if (!file) return null;
    try {
      const head = await this.s3(requestId).send(
        new HeadObjectCommand({ Bucket: this.bucket('private', requestId), Key: file.storageKey }),
      );
      if (head.ContentLength !== file.size || head.ContentType !== file.declaredMime) {
        await database.storedFile.update({
          where: { id: file.id },
          data: { scanStatus: 'REJECTED', uploadedAt: new Date() },
        });
        return 'metadata-mismatch' as const;
      }
    } catch {
      return 'upload-not-found' as const;
    }
    const now = new Date();
    await database.storedFile.update({
      where: { id: file.id },
      data: { scanStatus: 'QUARANTINED', uploadedAt: now },
    });
    const scanQueueState = await this.scans.enqueue({
      fileId: file.id,
      journalId: file.journalId,
      requestId,
      requestedAt: now.toISOString(),
    });
    return { fileId, scanStatus: 'QUARANTINED' as const, scanQueueState };
  }

  async approve(galleyId: string, actorId: string, requestId: string) {
    const galley = await database.galley.findUnique({
      where: { id: galleyId },
      include: { storedFile: true, publicationVersion: { include: { publication: true } } },
    });
    if (!galley || !(await this.editable(galley.publicationVersionId, actorId))) return null;
    if (galley.storedFile.scanStatus !== 'CLEAN') return 'not-clean' as const;
    await this.s3(requestId).send(
      new CopyObjectCommand({
        Bucket: this.bucket('public', requestId),
        Key: galley.storedFile.storageKey,
        CopySource: encodeURI(
          this.bucket('private', requestId) + '/' + galley.storedFile.storageKey,
        ),
        ContentType: galley.storedFile.detectedMime ?? galley.storedFile.declaredMime,
        MetadataDirective: 'REPLACE',
      }),
    );
    const now = new Date();
    return database.$transaction(async (tx) => {
      await tx.storedFile.update({
        where: { id: galley.storedFileId },
        data: { visibility: 'PUBLIC' },
      });
      const approved = await tx.galley.update({
        where: { id: galleyId },
        data: { approvedAt: now },
      });
      await tx.submission.update({
        where: { id: galley.publicationVersion.publication.submissionId },
        data: { state: 'PRODUCTION' },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.galley_approved',
          targetType: 'Galley',
          targetId: galleyId,
          requestId,
          metadata: {
            journalId: galley.storedFile.journalId,
            publicationId: galley.publicationVersion.publicationId,
          },
        },
      });
      return approved;
    });
  }

  async publicFile(galleyId: string) {
    const galley = await database.galley.findFirst({
      where: {
        id: galleyId,
        approvedAt: { not: null },
        storedFile: { visibility: 'PUBLIC', scanStatus: 'CLEAN' },
        publicationVersion: {
          publication: { status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] } },
        },
      },
      include: { storedFile: true },
    });
    if (!galley) return null;
    return {
      url: await getSignedUrl(
        this.s3('public-galley'),
        new GetObjectCommand({
          Bucket: this.bucket('public', 'public-galley'),
          Key: galley.storedFile.storageKey,
          ResponseContentDisposition: `inline; filename="${galley.storedFile.originalName.replace(/["\\]/g, '_')}"`,
        }),
        { expiresIn: 600 },
      ),
    };
  }

  async sourceFile(submissionId: string, fileId: string, actorId: string, requestId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: {
        submitterId: true,
        journalId: true,
        productionAssignments: {
          where: { assigneeId: actorId, active: true },
          select: { id: true },
        },
      },
    });
    if (!submission) return null;
    const manager = await database.journalMembership.findFirst({
      where: {
        journalId: submission.journalId,
        userId: actorId,
        role: { in: ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'] },
      },
    });
    if (submission.submitterId !== actorId && !submission.productionAssignments.length && !manager)
      return null;
    const file = await database.storedFile.findFirst({
      where: { id: fileId, scanStatus: 'CLEAN', submissionFile: { submissionId } },
    });
    if (!file) return null;
    const safeName = file.originalName.replace(/["\\\r\n]/g, '_');
    return {
      url: await getSignedUrl(
        this.s3(requestId),
        new GetObjectCommand({
          Bucket: this.bucket('private', requestId),
          Key: file.storageKey,
          ResponseContentDisposition: `attachment; filename="${safeName}"`,
        }),
        { expiresIn: 600 },
      ),
    };
  }

  private bucket(scope: 'private' | 'public', requestId: string) {
    const value =
      process.env[
        scope === 'private' ? 'OBJECT_STORAGE_BUCKET_PRIVATE' : 'OBJECT_STORAGE_BUCKET_PUBLIC'
      ];
    if (!value)
      throw new ServiceUnavailableException(
        createApiError(
          'OBJECT_STORAGE_NOT_CONFIGURED',
          'Penyimpanan belum dikonfigurasi.',
          requestId,
        ),
      );
    return value;
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
    return (this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    }));
  }
}
