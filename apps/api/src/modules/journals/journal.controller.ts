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
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createApiError, journalRoles, journalTemplateKinds } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { JournalService } from './journal.service.js';

const slugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const journalSchema = z.object({
  slug: slugSchema,
  title: z.string().min(3).max(200),
  abbreviation: z.string().min(2).max(24),
  description: z.string().min(20).max(2000),
  scope: z.string().min(20).max(4000),
  contactEmail: z.email(),
  printIssn: z
    .string()
    .regex(/^\d{4}-\d{3}[\dX]$/)
    .nullable()
    .optional(),
  electronicIssn: z
    .string()
    .regex(/^\d{4}-\d{3}[\dX]$/)
    .nullable()
    .optional(),
  primaryLanguage: z.string().min(2).max(10),
  reviewModel: z.enum(['SINGLE_ANONYMOUS', 'DOUBLE_ANONYMOUS']),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  submissionsOpen: z.boolean(),
});
const membershipSchema = z.object({
  email: z.email(),
  role: z.enum(journalRoles),
});
const optionalSortOrder = z.number().int().min(0).max(9999).optional();
const sectionSchema = z.object({
  slug: slugSchema,
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  sortOrder: optionalSortOrder,
  isActive: z.boolean().optional(),
});
const articleTypeSchema = z.object({
  slug: slugSchema,
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  sectionId: z.uuid().nullable().optional(),
  peerReviewRequired: z.boolean().optional(),
  sortOrder: optionalSortOrder,
  isActive: z.boolean().optional(),
});
const checklistSchema = z.object({
  label: z.string().min(8).max(500),
  isRequired: z.boolean().optional(),
  sortOrder: optionalSortOrder,
  isActive: z.boolean().optional(),
});
const declarationSchema = z.object({
  code: slugSchema,
  title: z.string().min(3).max(200),
  body: z.string().min(20).max(8000),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const declarationUpdateSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    body: z.string().min(20).max(8000).optional(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const templateSchema = z.object({
  kind: z.enum(journalTemplateKinds),
  slug: slugSchema,
  title: z.string().min(3).max(200),
  body: z.string().min(20).max(20000),
  sortOrder: optionalSortOrder,
  isActive: z.boolean().optional(),
});
const reviewFormSchema = z.object({
  name: z.string().trim().min(3).max(200),
  sectionId: z.uuid().nullable().optional(),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(5).max(1000),
        type: z.enum(['LONG_TEXT', 'BOOLEAN', 'RATING']).default('LONG_TEXT'),
        required: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(50),
});

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('journals')
export class PublicJournalController {
  constructor(private readonly journals: JournalService) {}

  @Get()
  list() {
    return this.journals.listPublic();
  }

  @Get(':journalSlug')
  async detail(@Param('journalSlug') journalSlug: string, @Req() request: RequestWithContext) {
    const journal = await this.journals.getPublic(journalSlug);
    if (!journal)
      throw new NotFoundException(
        createApiError(
          'JOURNAL_NOT_FOUND',
          'Jurnal tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return journal;
  }
}

@Controller('admin/journals')
export class AdminJournalController {
  constructor(
    private readonly journals: JournalService,
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

  private requireCsrf(request: RequestWithContext, csrfToken?: string) {
    if (!csrfToken || csrfToken !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
  }

  private invalid(request: RequestWithContext, code: string, message: string) {
    return new BadRequestException(createApiError(code, message, request.requestId ?? 'unknown'));
  }

  private async requireManage(
    request: RequestWithContext,
    journalId: string,
    permission:
      'journal.settings.manage' | 'journal.memberships.manage' = 'journal.settings.manage',
  ) {
    const identity = await this.identity(request);
    if (
      !(await this.journals.canManage(
        journalId,
        identity.user.id,
        identity.user.platformRole,
        permission,
      ))
    )
      throw new ForbiddenException(
        createApiError(
          'JOURNAL_ACCESS_DENIED',
          'Akses jurnal ditolak.',
          request.requestId ?? 'unknown',
        ),
      );
    return identity;
  }

  private conflict(request: RequestWithContext) {
    return new ConflictException(
      createApiError(
        'JOURNAL_CONFIG_CONFLICT',
        'Kode atau slug konfigurasi sudah digunakan di jurnal ini.',
        request.requestId ?? 'unknown',
      ),
    );
  }

  private missingConfig(request: RequestWithContext) {
    return new NotFoundException(
      createApiError(
        'JOURNAL_CONFIG_NOT_FOUND',
        'Konfigurasi jurnal tidak ditemukan.',
        request.requestId ?? 'unknown',
      ),
    );
  }

  @Get()
  async list(@Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    return this.journals.listForUser(identity.user.id, identity.user.platformRole);
  }

  @Get(':journalId')
  async detail(@Param('journalId') journalId: string, @Req() request: RequestWithContext) {
    await this.requireManage(request, journalId);
    const journal = await this.journals.loadConfiguration(journalId);
    if (!journal)
      throw new NotFoundException(
        createApiError(
          'JOURNAL_NOT_FOUND',
          'Jurnal tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return journal;
  }

  @Post()
  async create(
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    this.requireCsrf(request, csrfToken);
    if (identity.user.platformRole !== 'PLATFORM_ADMIN')
      throw new ForbiddenException(
        createApiError(
          'JOURNAL_CREATE_FORBIDDEN',
          'Akses ditolak.',
          request.requestId ?? 'unknown',
        ),
      );
    const parsed = journalSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'JOURNAL_INPUT_INVALID', 'Konfigurasi jurnal tidak valid.');
    return this.journals.create(parsed.data, identity.user.id, request.requestId ?? 'unknown');
  }

  @Patch(':journalId')
  async update(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = journalSchema.partial().safeParse(input);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      throw this.invalid(request, 'JOURNAL_INPUT_INVALID', 'Konfigurasi jurnal tidak valid.');
    return this.journals.update(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
  }

  @Post(':journalId/memberships')
  async addMembership(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId, 'journal.memberships.manage');
    this.requireCsrf(request, csrfToken);
    const parsed = membershipSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'MEMBERSHIP_INPUT_INVALID', 'Data keanggotaan tidak valid.');
    const result = await this.journals.addMembership(
      journalId,
      parsed.data.email,
      parsed.data.role,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!result)
      throw new NotFoundException(
        createApiError(
          'MEMBERSHIP_USER_NOT_FOUND',
          'Pengguna terverifikasi tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return result;
  }

  @Post(':journalId/sections')
  async createSection(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = sectionSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'JOURNAL_SECTION_INVALID', 'Data seksi jurnal tidak valid.');
    const created = await this.journals.createSection(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (created === 'conflict') throw this.conflict(request);
    return created;
  }

  @Patch(':journalId/sections/:sectionId')
  async updateSection(
    @Param('journalId') journalId: string,
    @Param('sectionId') sectionId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = sectionSchema.partial().safeParse(input);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      throw this.invalid(request, 'JOURNAL_SECTION_INVALID', 'Data seksi jurnal tidak valid.');
    const updated = await this.journals.updateSection(
      journalId,
      sectionId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (updated === 'conflict') throw this.conflict(request);
    if (!updated) throw this.missingConfig(request);
    return updated;
  }

  @Post(':journalId/article-types')
  async createArticleType(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = articleTypeSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'ARTICLE_TYPE_INVALID', 'Data jenis artikel tidak valid.');
    const created = await this.journals.createArticleType(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (created === 'conflict') throw this.conflict(request);
    if (created === 'invalid-section')
      throw this.invalid(
        request,
        'ARTICLE_TYPE_SECTION_INVALID',
        'Seksi tidak berada pada jurnal yang sama.',
      );
    return created;
  }

  @Patch(':journalId/article-types/:articleTypeId')
  async updateArticleType(
    @Param('journalId') journalId: string,
    @Param('articleTypeId') articleTypeId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = articleTypeSchema.partial().safeParse(input);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      throw this.invalid(request, 'ARTICLE_TYPE_INVALID', 'Data jenis artikel tidak valid.');
    const updated = await this.journals.updateArticleType(
      journalId,
      articleTypeId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (updated === 'conflict') throw this.conflict(request);
    if (updated === 'invalid-section')
      throw this.invalid(
        request,
        'ARTICLE_TYPE_SECTION_INVALID',
        'Seksi tidak berada pada jurnal yang sama.',
      );
    if (!updated) throw this.missingConfig(request);
    return updated;
  }

  @Post(':journalId/checklist-items')
  async createChecklistItem(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = checklistSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'CHECKLIST_ITEM_INVALID', 'Butir checklist tidak valid.');
    return this.journals.createChecklistItem(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
  }

  @Patch(':journalId/checklist-items/:itemId')
  async updateChecklistItem(
    @Param('journalId') journalId: string,
    @Param('itemId') itemId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = checklistSchema.partial().safeParse(input);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      throw this.invalid(request, 'CHECKLIST_ITEM_INVALID', 'Butir checklist tidak valid.');
    const updated = await this.journals.updateChecklistItem(
      journalId,
      itemId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!updated) throw this.missingConfig(request);
    return updated;
  }

  @Post(':journalId/declarations')
  async createDeclaration(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = declarationSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'DECLARATION_INVALID', 'Deklarasi jurnal tidak valid.');
    const created = await this.journals.createDeclaration(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (created === 'conflict') throw this.conflict(request);
    return created;
  }

  @Patch(':journalId/declarations/:declarationId')
  async updateDeclaration(
    @Param('journalId') journalId: string,
    @Param('declarationId') declarationId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = declarationUpdateSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'DECLARATION_INVALID', 'Deklarasi jurnal tidak valid.');
    const updated = await this.journals.updateDeclaration(
      journalId,
      declarationId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (!updated) throw this.missingConfig(request);
    return updated;
  }

  @Post(':journalId/templates')
  async createTemplate(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'TEMPLATE_INVALID', 'Template jurnal tidak valid.');
    const created = await this.journals.createTemplate(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (created === 'conflict') throw this.conflict(request);
    return created;
  }

  @Patch(':journalId/templates/:templateId')
  async updateTemplate(
    @Param('journalId') journalId: string,
    @Param('templateId') templateId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = templateSchema.partial().safeParse(input);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      throw this.invalid(request, 'TEMPLATE_INVALID', 'Template jurnal tidak valid.');
    const updated = await this.journals.updateTemplate(
      journalId,
      templateId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (updated === 'conflict') throw this.conflict(request);
    if (!updated) throw this.missingConfig(request);
    return updated;
  }

  @Post(':journalId/review-forms')
  async createReviewForm(
    @Param('journalId') journalId: string,
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.requireManage(request, journalId);
    this.requireCsrf(request, csrfToken);
    const parsed = reviewFormSchema.safeParse(input);
    if (!parsed.success)
      throw this.invalid(request, 'REVIEW_FORM_INVALID', 'Form review tidak valid.');
    const created = await this.journals.createReviewForm(
      journalId,
      parsed.data,
      identity.user.id,
      request.requestId ?? 'unknown',
    );
    if (created === 'invalid-section')
      throw this.invalid(request, 'REVIEW_FORM_SECTION_INVALID', 'Seksi form review tidak valid.');
    return created;
  }
}
