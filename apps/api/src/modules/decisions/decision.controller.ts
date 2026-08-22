import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createApiError } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { DecisionService } from './decision.service.js';

const decisionSchema = z
  .object({
    type: z.enum(['REJECT', 'MAJOR_REVISION', 'MINOR_REVISION', 'ACCEPT']),
    reason: z.string().trim().min(20).max(12000),
    subject: z.string().trim().min(5).max(300),
    body: z.string().trim().min(40).max(30000),
    revisionDueAt: z.iso.datetime().optional(),
    responseRequired: z.boolean().default(true),
    evaluationMode: z.enum(['EXTERNAL_REVIEW', 'EDITOR_ONLY']).optional(),
    releaseResponseIds: z.array(z.uuid()).max(20).default([]),
    releaseReviewFileIds: z.array(z.uuid()).max(50).default([]),
  })
  .transform((value) => ({
    ...value,
    revisionDueAt: value.revisionDueAt ? new Date(value.revisionDueAt) : undefined,
  }));
const revisionDraftSchema = z.object({ responseText: z.string().max(30000) });

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('decisions')
export class DecisionController {
  constructor(
    private readonly decisions: DecisionService,
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
        createApiError('DECISION_ACCESS_DENIED', 'Akses keputusan editorial ditolak.', requestId),
      );
    if (result === 'revision-invalid')
      throw new BadRequestException(
        createApiError(
          'REVISION_CONFIGURATION_INVALID',
          'Tenggat dan jalur evaluasi revisi tidak valid.',
          requestId,
        ),
      );
    if (result === 'release-invalid')
      throw new BadRequestException(
        createApiError(
          'DECISION_REVIEW_RELEASE_INVALID',
          'Komentar atau file review yang dipilih tidak dapat dirilis.',
          requestId,
        ),
      );
    if (result === 'review-incomplete')
      throw new UnprocessableEntityException(
        createApiError(
          'REVIEW_ROUND_INCOMPLETE',
          'Round belum memiliki review final untuk diputuskan.',
          requestId,
        ),
      );
    if (result === 'too-soon')
      throw new ConflictException(
        createApiError(
          'REVISION_REMINDER_TOO_SOON',
          'Pengingat revisi hanya dapat dikirim sekali dalam 24 jam.',
          requestId,
        ),
      );
    if (result === 'version-missing')
      throw new UnprocessableEntityException(
        createApiError(
          'SUBMISSION_VERSION_MISSING',
          'Versi naskah yang menjadi target keputusan tidak ditemukan.',
          requestId,
        ),
      );
    throw new ConflictException(
      createApiError(
        'DECISION_STATE_CONFLICT',
        'Keputusan tidak diizinkan pada state submission saat ini.',
        requestId,
      ),
    );
  }

  @Get('editor/submissions/:submissionId/context')
  async context(@Param('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    if (!z.uuid().safeParse(submissionId).success)
      throw new BadRequestException(
        createApiError(
          'SUBMISSION_ID_INVALID',
          'ID submission tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.decisions.context(submissionId, identity.user.id);
    if (!result) this.fail('forbidden', request);
    return result;
  }

  @Post('submissions/:submissionId')
  async decide(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'EDITORIAL_DECISION_INVALID',
          'Data keputusan editorial tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.decisions.decide(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Put('revisions/:revisionId/draft')
  async saveRevision(
    @Param('revisionId') revisionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const parsed = revisionDraftSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'REVISION_DRAFT_INVALID',
          'Tanggapan revisi tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.decisions.saveRevision(
      revisionId,
      identity.user.id,
      parsed.data.responseText,
      request.requestId ?? 'unknown',
    );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'REVISION_NOT_FOUND',
          'Permintaan revisi tidak ditemukan atau sudah dikirim.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post('revisions/:revisionId/finalize')
  async finalizeRevision(
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128)
      throw new BadRequestException(
        createApiError(
          'IDEMPOTENCY_KEY_REQUIRED',
          'Idempotency-Key yang valid diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.decisions.finalizeRevision(
      revisionId,
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
          'REVISION_NOT_FOUND',
          'Permintaan revisi tidak ditemukan atau sudah dikirim.',
          request.requestId ?? 'unknown',
        ),
      );
    if ('validationErrors' in result)
      throw new UnprocessableEntityException(
        createApiError(
          'REVISION_VALIDATION_FAILED',
          'Revisi belum memenuhi seluruh persyaratan.',
          request.requestId ?? 'unknown',
          { fields: result.validationErrors },
        ),
      );
    return result;
  }

  @Get('submissions/:submissionId/files/:fileId/download')
  async releasedFile(
    @Param('submissionId') submissionId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    const result = await this.decisions.authorizeReleasedFile(
      submissionId,
      fileId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'DECISION_FILE_NOT_FOUND',
          'File keputusan tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post('revisions/:revisionId/reminders')
  async remindRevision(
    @Param('revisionId') revisionId: string,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.csrf(request, csrf);
    const result = await this.decisions.remindRevision(
      revisionId,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (result !== 'sent') this.fail(result, request);
    return { sent: true };
  }
}
