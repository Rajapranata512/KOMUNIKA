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
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createApiError, submissionStates } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { EditorialService } from './editorial.service.js';

const queueSchema = z.object({
  journalId: z.uuid(),
  state: z.enum(submissionStates).optional(),
  q: z.string().trim().max(200).optional(),
  assigned: z.enum(['all', 'unassigned', 'mine']).optional(),
  sort: z.enum(['oldest', 'newest']).optional(),
  cursor: z.uuid().optional(),
});
const assessmentSchema = z.object({
  completenessPassed: z.boolean(),
  scopePassed: z.boolean(),
  policyPassed: z.boolean(),
  internalNote: z.string().trim().max(4000).default(''),
});
const assignmentSchema = z.object({
  editorId: z.uuid(),
  assignmentNote: z.string().trim().max(2000).default(''),
  overrideReason: z.string().trim().min(10).max(2000).optional(),
});
const decisionSchema = z.object({
  type: z.enum(['REQUEST_CORRECTION', 'DESK_REJECT']),
  reason: z.string().trim().min(10).max(4000),
  authorLetter: z.string().trim().min(20).max(12000),
  requiredChanges: z.array(z.string().trim().min(3).max(500)).max(30).default([]),
});
const noteSchema = z.object({ body: z.string().trim().min(1).max(8000) });

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const item = request.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

abstract class EditorialControllerBase {
  constructor(
    protected readonly editorial: EditorialService,
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

  protected requireCsrf(request: RequestWithContext, token?: string) {
    if (!token || token !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
  }

  protected resultError(result: string, requestId: string): never {
    if (result === 'forbidden')
      throw new ForbiddenException(
        createApiError(
          'EDITORIAL_ACCESS_DENIED',
          'Akses editorial untuk submission ini tidak tersedia.',
          requestId,
        ),
      );
    if (result === 'not-found')
      throw new NotFoundException(
        createApiError('SUBMISSION_NOT_FOUND', 'Submission tidak ditemukan.', requestId),
      );
    if (result === 'screening-incomplete')
      throw new UnprocessableEntityException(
        createApiError(
          'SCREENING_CHECKS_INCOMPLETE',
          'Seluruh pemeriksaan harus lulus sebelum editor ditugaskan.',
          requestId,
        ),
      );
    if (result === 'invalid-editor')
      throw new BadRequestException(
        createApiError(
          'EDITOR_TENANT_INVALID',
          'Editor tidak aktif atau bukan anggota editorial jurnal ini.',
          requestId,
        ),
      );
    if (result === 'override-reason-required')
      throw new UnprocessableEntityException(
        createApiError(
          'ASSIGNMENT_OVERRIDE_REASON_REQUIRED',
          'Alasan override wajib dicatat untuk mengganti assignment aktif.',
          requestId,
        ),
      );
    if (result === 'required-changes-missing')
      throw new UnprocessableEntityException(
        createApiError(
          'CORRECTION_ITEMS_REQUIRED',
          'Permintaan koreksi harus menyebutkan perubahan yang diperlukan.',
          requestId,
        ),
      );
    throw new ConflictException(
      createApiError(
        'SUBMISSION_TRANSITION_NOT_ALLOWED',
        'Tindakan editorial tidak diizinkan pada tahap submission saat ini.',
        requestId,
      ),
    );
  }
}

@Controller('editorial')
export class EditorialQueryController extends EditorialControllerBase {
  constructor(editorial: EditorialService, auth: AuthService) {
    super(editorial, auth);
  }

  @Get('journals')
  async journals(@Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    return this.editorial.listJournals(identity.user.id);
  }

  @Get('queue')
  async queue(@Query() input: unknown, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    const parsed = queueSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'EDITORIAL_QUEUE_FILTER_INVALID',
          'Filter queue editorial tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.editorial.listQueue(
      {
        journalId: parsed.data.journalId,
        state: parsed.data.state,
        query: parsed.data.q,
        assigned: parsed.data.assigned,
        sort: parsed.data.sort,
        cursor: parsed.data.cursor,
      },
      identity.user.id,
    );
    if (!result) this.resultError('forbidden', request.requestId ?? 'unknown');
    return result;
  }

  @Get('submissions/:submissionId')
  async detail(@Param('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    const result = await this.editorial.detail(submissionId, identity.user.id);
    if (!result) this.resultError('not-found', request.requestId ?? 'unknown');
    return result;
  }
}

@Controller('submissions/:submissionId')
export class EditorialActionController extends EditorialControllerBase {
  constructor(editorial: EditorialService, auth: AuthService) {
    super(editorial, auth);
  }

  @Post('screening-checks')
  async assess(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrf);
    const parsed = assessmentSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'SCREENING_INPUT_INVALID',
          'Data pemeriksaan screening tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.editorial.recordAssessment(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.resultError(result, request.requestId ?? 'unknown');
    return result;
  }

  @Post('editorial-assignments')
  async assign(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrf);
    const parsed = assignmentSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'EDITORIAL_ASSIGNMENT_INVALID',
          'Editor atau catatan assignment tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.editorial.assignEditor(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.resultError(result, request.requestId ?? 'unknown');
    return result;
  }

  @Post('screening-decisions')
  async decide(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrf);
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'SCREENING_DECISION_INVALID',
          'Alasan, surat keputusan, atau daftar koreksi tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.editorial.decide(
      submissionId,
      identity.user.id,
      parsed.data,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.resultError(result, request.requestId ?? 'unknown');
    return result;
  }

  @Post('editorial-notes')
  async note(
    @Param('submissionId') submissionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrf);
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'EDITORIAL_NOTE_INVALID',
          'Catatan internal tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    const result = await this.editorial.addInternalNote(
      submissionId,
      identity.user.id,
      parsed.data.body,
      request.requestId ?? 'unknown',
    );
    if (typeof result === 'string') this.resultError(result, request.requestId ?? 'unknown');
    return result;
  }
}
