import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createApiError } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { SubmissionFileService } from './submission-file.service.js';
import { SubmissionService } from './submission.service.js';

const authorSchema = z.object({
  givenName: z.string().trim().min(1).max(120),
  familyName: z.string().trim().max(120),
  email: z.email(),
  affiliation: z.string().trim().min(1).max(240),
  countryCode: z.string().trim().length(2).nullable().optional(),
  orcidId: z
    .string()
    .trim()
    .regex(/^d{4}-d{4}-d{4}-d{3}[dX]$/)
    .nullable()
    .optional(),
  isCorresponding: z.boolean(),
});
const createSchema = z.object({ articleTypeId: z.uuid() });
const uploadSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  declaredMime: z.string().trim().min(3).max(160),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  purpose: z.enum(['MANUSCRIPT', 'SUPPLEMENTARY', 'COVER_LETTER', 'RESPONSE']),
});
const draftSchema = z
  .object({
    articleTypeId: z.uuid().optional(),
    title: z.string().trim().max(500).optional(),
    subtitle: z.string().trim().max(500).nullable().optional(),
    abstract: z.string().trim().max(12000).optional(),
    coverLetter: z.string().trim().max(12000).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    authors: z.array(authorSchema).max(50).optional(),
    keywords: z.array(z.string().trim().min(2).max(100)).max(20).optional(),
    subjects: z.array(z.string().trim().min(2).max(120)).max(20).optional(),
    declarationAcceptances: z
      .array(z.object({ declarationId: z.uuid(), accepted: z.boolean() }))
      .max(50)
      .optional(),
    checklistAcceptances: z
      .array(z.object({ checklistItemId: z.uuid(), accepted: z.boolean() }))
      .max(100)
      .optional(),
  })
  .refine(
    (value) => !value.authors || value.authors.filter((item) => item.isCorresponding).length <= 1,
  )
  .refine((value) => Object.keys(value).length > 0);

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const item = request.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

abstract class SubmissionControllerBase {
  constructor(
    protected readonly submissions: SubmissionService,
    protected readonly auth: AuthService,
  ) {}

  protected async identity(request: RequestWithContext) {
    const identity = await this.auth.authenticateUser(cookieValue(request, 'aksara_session'));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'AUTH_REQUIRED',
          'Sesi pengguna diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return identity;
  }

  protected requireCsrf(request: RequestWithContext, csrfToken?: string) {
    if (!csrfToken || csrfToken !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
  }
}

@Controller('journals/:journalId/submissions')
export class JournalSubmissionController extends SubmissionControllerBase {
  constructor(submissions: SubmissionService, auth: AuthService) {
    super(submissions, auth);
  }

  @Post()
  async create(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    if (!identity.user.emailVerified)
      throw new ForbiddenException(
        createApiError(
          'EMAIL_VERIFICATION_REQUIRED',
          'Verifikasi email diperlukan sebelum membuat submission.',
          request.requestId ?? 'unknown',
        ),
      );
    const parsed = createSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_INPUT_INVALID',
          'Jenis artikel tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const submission = await this.submissions.createDraft(
      journalId,
      parsed.data.articleTypeId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!submission)
      throw new ForbiddenException(
        createApiError(
          'SUBMISSION_NOT_AVAILABLE',
          'Jurnal tidak menerima submission atau jenis artikel tidak tersedia.',
          request.requestId ?? 'unknown',
        ),
      );
    return submission;
  }
}

@Controller('submissions')
export class SubmissionController extends SubmissionControllerBase {
  constructor(
    submissions: SubmissionService,
    auth: AuthService,
    private readonly files: SubmissionFileService,
  ) {
    super(submissions, auth);
  }

  @Get()
  async list(@Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    return this.submissions.listForAuthor(identity.user.id);
  }

  @Get(':submissionId')
  async detail(@Param('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    const submission = await this.submissions.getForAuthor(submissionId, identity.user.id);
    if (!submission)
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_NOT_FOUND',
          'Submission tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return submission;
  }

  @Patch(':submissionId/draft')
  async updateDraft(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_DRAFT_INVALID',
          'Data draf submission tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.submissions.updateDraft(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (result === 'invalid-article-type')
      throw new BadRequestException(
        createApiError(
          'ARTICLE_TYPE_TENANT_INVALID',
          'Jenis artikel bukan milik jurnal submission.',
          request.requestId ?? 'unknown',
        ),
      );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_DRAFT_NOT_FOUND',
          'Draf tidak ditemukan atau tidak lagi dapat diubah.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post(':submissionId/files/upload-authorizations')
  async authorizeUpload(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    const parsed = uploadSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_FILE_INVALID',
          'Nama, tipe, atau ukuran file tidak diizinkan.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.files.authorize(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (result === 'invalid-file')
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_FILE_INVALID',
          'Tipe file tidak diizinkan atau ukuran melebihi 25 MB.',
          request.requestId ?? 'unknown',
        ),
      );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_DRAFT_NOT_FOUND',
          'Draf tidak ditemukan atau tidak lagi dapat diubah.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post(':submissionId/files/:fileId/complete')
  async completeUpload(
    @Param('submissionId') submissionId: string,
    @Param('fileId') fileId: string,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    const result = await this.files.complete(
      submissionId,
      fileId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_FILE_NOT_FOUND',
          'File upload tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    if (result === 'upload-not-found' || result === 'metadata-mismatch')
      throw new BadRequestException(
        createApiError(
          result === 'upload-not-found' ? 'FILE_UPLOAD_NOT_FOUND' : 'FILE_METADATA_MISMATCH',
          result === 'upload-not-found'
            ? 'Upload belum ditemukan pada penyimpanan.'
            : 'Ukuran atau tipe file berbeda dari otorisasi.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Delete(':submissionId/files/:fileId')
  async removeFile(
    @Param('submissionId') submissionId: string,
    @Param('fileId') fileId: string,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    if (
      !(await this.files.remove(
        submissionId,
        fileId,
        identity.user.id,
        request.requestId ?? 'unknown',
      ))
    )
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_FILE_NOT_FOUND',
          'File tidak ditemukan atau tidak dapat dihapus.',
          request.requestId ?? 'unknown',
        ),
      );
    return { removed: true };
  }

  @Post(':submissionId/finalize')
  async finalize(
    @Param('submissionId') submissionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)
      throw new BadRequestException(
        createApiError(
          'IDEMPOTENCY_KEY_REQUIRED',
          'Idempotency-Key yang valid diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.submissions.finalize(
      submissionId,
      identity.user.id,
      idempotencyKey,
      request.requestId ?? 'unknown',
    );
    if (result === 'idempotency-conflict')
      throw new ConflictException(
        createApiError(
          'IDEMPOTENCY_KEY_CONFLICT',
          'Idempotency-Key telah digunakan untuk operasi lain.',
          request.requestId ?? 'unknown',
        ),
      );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'SUBMISSION_DRAFT_NOT_FOUND',
          'Draf tidak ditemukan atau sudah difinalisasi.',
          request.requestId ?? 'unknown',
        ),
      );
    if ('validationErrors' in result)
      throw new UnprocessableEntityException(
        createApiError(
          'SUBMISSION_VALIDATION_FAILED',
          'Submission belum memenuhi seluruh persyaratan.',
          request.requestId ?? 'unknown',
          { fields: result.validationErrors },
        ),
      );
    return result;
  }
}
