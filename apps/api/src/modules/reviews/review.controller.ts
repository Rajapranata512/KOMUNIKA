import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createApiError } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { ReviewService } from './review.service.js';

const inviteSchema = z
  .object({
    reviewerId: z.uuid(),
    reviewFormId: z.uuid(),
    responseDeadline: z.iso.datetime(),
    reviewDeadline: z.iso.datetime(),
  })
  .transform((value) => ({
    ...value,
    responseDeadline: new Date(value.responseDeadline),
    reviewDeadline: new Date(value.reviewDeadline),
  }));
const respondSchema = z.object({
  token: z.string().min(32).max(200),
  response: z.enum(['ACCEPT', 'DECLINE']),
  conflictDeclared: z.boolean(),
  conflictNote: z.string().trim().max(2000).default(''),
});
const answerSchema = z.object({ questionId: z.uuid(), value: z.string().max(12000) });
const reviewSchema = z.object({
  commentsToAuthor: z.string().max(20000).default(''),
  confidentialComments: z.string().max(20000).default(''),
  recommendation: z.enum(['ACCEPT', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECT']).optional(),
  answers: z.array(answerSchema).max(100).default([]),
});
const fileSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  declaredMime: z.string().trim().min(3).max(200),
  size: z.number().int().positive(),
  authorVisible: z.boolean().default(false),
});

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('reviews')
export class ReviewController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly auth: AuthService,
  ) {}

  private async identity(request: RequestWithContext) {
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

  private csrf(request: RequestWithContext, token?: string) {
    if (!token || token !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
  }

  private fail(result: string, request: RequestWithContext): never {
    const requestId = request.requestId ?? 'unknown';
    if (result === 'forbidden')
      throw new ForbiddenException(
        createApiError('REVIEW_ACCESS_DENIED', 'Akses peer review ditolak.', requestId),
      );
    if (result === 'not-found')
      throw new NotFoundException(
        createApiError('REVIEW_NOT_FOUND', 'Undangan atau assignment tidak ditemukan.', requestId),
      );
    if (result === 'expired')
      throw new ConflictException(
        createApiError('REVIEW_INVITATION_EXPIRED', 'Undangan sudah kedaluwarsa.', requestId),
      );
    if (result === 'deadline-invalid')
      throw new BadRequestException(
        createApiError('REVIEW_DEADLINE_INVALID', 'Urutan tenggat review tidak valid.', requestId),
      );
    if (result === 'reviewer-unavailable')
      throw new ConflictException(
        createApiError(
          'REVIEWER_UNAVAILABLE',
          'Reviewer tidak tersedia atau kapasitasnya penuh.',
          requestId,
        ),
      );
    if (result === 'incomplete')
      throw new UnprocessableEntityException(
        createApiError(
          'REVIEW_INCOMPLETE',
          'Komentar, rekomendasi, atau jawaban wajib belum lengkap.',
          requestId,
        ),
      );
    if (result === 'conflict')
      throw new UnprocessableEntityException(
        createApiError(
          'REVIEW_CONFLICT_DECLARED',
          'Undangan dengan konflik tidak dapat diterima.',
          requestId,
        ),
      );
    if (result === 'too-soon')
      throw new ConflictException(
        createApiError(
          'REVIEW_REMINDER_TOO_SOON',
          'Pengingat hanya dapat dikirim sekali dalam 24 jam.',
          requestId,
        ),
      );
    throw new ConflictException(
      createApiError(
        'REVIEW_STATE_CONFLICT',
        'Tindakan tidak diizinkan pada state review saat ini.',
        requestId,
      ),
    );
  }

  @Get('directory')
  async directory(
    @Query('submissionId') submissionId: string,
    @Query('q') query: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    if (!z.uuid().safeParse(submissionId).success || (query?.length ?? 0) > 200)
      throw new BadRequestException(
        createApiError(
          'REVIEW_DIRECTORY_FILTER_INVALID',
          'Filter reviewer tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.directory(submissionId, identity.user.id, query?.trim());
    if (!result) this.fail('forbidden', request);
    return result;
  }

  @Get('forms')
  async forms(@Query('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    if (!z.uuid().safeParse(submissionId).success)
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_ID_INVALID',
          'ID submission tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.forms(submissionId, identity.user.id);
    if (!result) this.fail('forbidden', request);
    return result;
  }

  @Post('submissions/:submissionId/invitations')
  async invite(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'REVIEW_INVITATION_INVALID',
          'Undangan reviewer tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.invite(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Get('editor/submissions/:submissionId/rounds')
  async rounds(@Param('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    const result = await this.reviews.editorRounds(submissionId, identity.user.id);
    if (!result) this.fail('forbidden', request);
    return result;
  }

  @Post('invitations/:invitationId/reminders')
  async remind(
    @Param('invitationId') invitationId: string,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const result = await this.reviews.remind(
      invitationId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (result !== 'sent') this.fail(result, request);
    return { status: result };
  }

  @Get('invitations/:invitationId')
  async invitation(
    @Param('invitationId') invitationId: string,
    @Query('token') token: string,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    if (!token) this.fail('not-found', request);
    const result = await this.reviews.invitation(invitationId, token, identity.user.id);
    if (!result) this.fail('not-found', request);
    if (result === 'expired') this.fail(result, request);
    return result;
  }

  @Post('invitations/:invitationId/respond')
  async respond(
    @Param('invitationId') invitationId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = respondSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'REVIEW_RESPONSE_INVALID',
          'Respons undangan tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.respond(
      invitationId,
      parsed.data.token,
      identity.user.id,
      parsed.data.response === 'ACCEPT',
      parsed.data.conflictDeclared,
      parsed.data.conflictNote,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Get('assignments')
  async assignments(@Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    return this.reviews.listForReviewer(identity.user.id);
  }

  @Get('assignments/:assignmentId')
  async assignment(
    @Param('assignmentId') assignmentId: string,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    const result = await this.reviews.assignment(assignmentId, identity.user.id);
    if (!result) this.fail('not-found', request);
    return result;
  }

  @Get('assignments/:assignmentId/files/:fileId')
  async file(
    @Param('assignmentId') assignmentId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    const result = await this.reviews.download(
      assignmentId,
      fileId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail('not-found', request);
    return result;
  }

  @Put('assignments/:assignmentId/draft')
  async save(
    @Param('assignmentId') assignmentId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    return this.writeReview(assignmentId, input, csrf, request, false);
  }

  @Post('assignments/:assignmentId/files/authorize')
  async authorizeFile(
    @Param('assignmentId') assignmentId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = fileSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'REVIEW_FILE_INVALID',
          'File review tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.authorizeFile(
      assignmentId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail('not-found', request);
    if (result === 'invalid-file')
      throw new UnprocessableEntityException(
        createApiError(
          'REVIEW_FILE_REJECTED',
          'Ukuran atau tipe file review tidak diizinkan.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post('assignments/:assignmentId/files/:fileId/complete')
  async completeFile(
    @Param('assignmentId') assignmentId: string,
    @Param('fileId') fileId: string,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const result = await this.reviews.completeFile(
      assignmentId,
      fileId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail('not-found', request);
    if (typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Delete('assignments/:assignmentId/files/:fileId')
  async removeFile(
    @Param('assignmentId') assignmentId: string,
    @Param('fileId') fileId: string,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    if (
      !(await this.reviews.removeFile(
        assignmentId,
        fileId,
        identity.user.id,
        request.requestId ?? 'unknown',
      ))
    )
      this.fail('not-found', request);
    return { removed: true };
  }

  @Post('assignments/:assignmentId/submit')
  async submit(
    @Param('assignmentId') assignmentId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    return this.writeReview(assignmentId, input, csrf, request, true);
  }

  private async writeReview(
    assignmentId: string,
    input: unknown,
    csrf: string | undefined,
    request: RequestWithContext,
    submit: boolean,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'REVIEW_CONTENT_INVALID',
          'Isi review tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.reviews.save(
      assignmentId,
      identity.user.id,
      parsed.data,
      submit,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.fail(result, request);
    return result;
  }
}
