import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  Query,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createApiError } from '@aksara/domain';
import { z } from 'zod';
import { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { ProductionService } from './production.service.js';
import { GalleyFileService } from './galley-file.service.js';

const slug = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const issueSchema = z.object({
  journalId: z.uuid(),
  slug,
  volume: z.string().min(1).max(30),
  number: z.string().min(1).max(30),
  year: z.number().int().min(1900).max(2200),
  title: z.string().min(3).max(300),
  description: z.string().max(5000).default(''),
});
const publicAuthorSchema = z
  .object({
    givenName: z.string().max(120).optional(),
    familyName: z.string().max(120).optional(),
    name: z.string().max(240).optional(),
    affiliation: z.string().max(500).optional(),
    countryCode: z.string().max(2).nullable().optional(),
    orcidId: z.string().max(40).nullable().optional(),
  })
  .refine((author) => Boolean(author.name || author.givenName || author.familyName));
const metadataSchema = z.object({
  slug,
  title: z.string().min(3).max(500),
  subtitle: z.string().max(500).nullable().optional(),
  abstract: z.string().min(20).max(30000),
  authors: z.array(publicAuthorSchema).min(1).max(100),
  keywords: z.array(z.string().min(1).max(120)).max(50),
  language: z.string().min(2).max(10),
  licenseName: z.string().min(3).max(200),
  licenseUrl: z.url(),
  copyrightHolder: z.string().min(2).max(300),
  pages: z.string().max(50).nullable().optional(),
  eLocator: z.string().max(80).nullable().optional(),
  issueId: z.uuid().nullable().optional(),
  articleOrder: z.number().int().min(0).max(10000).optional(),
});
const scheduleSchema = z.object({
  scheduledAt: z.iso.datetime().transform((value) => new Date(value)),
});
const publishSchema = z.object({ idempotencyKey: z.string().min(16).max(200) });
const galleySchema = z.object({
  originalName: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  format: z.enum(['PDF', 'EPUB', 'XML']),
  label: z.string().min(2).max(80),
  locale: z.string().min(2).max(10),
});
const sourceFileSchema = z.object({
  originalName: z.string().min(1).max(255),
  declaredMime: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
  ]),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});
const coverFileSchema = z.object({
  originalName: z.string().min(1).max(255),
  declaredMime: z.enum(['image/jpeg', 'image/png']),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});
const assignmentSchema = z.object({
  assigneeId: z.uuid(),
  stage: z.enum(['COPYEDITING', 'PRODUCTION']),
  note: z.string().max(2000).default(''),
});
const querySchema = z.object({ question: z.string().trim().min(10).max(10000) });
const answerSchema = z.object({ response: z.string().trim().min(10).max(10000) });
const publicationUpdateSchema = z.object({
  type: z.enum(['CORRECTION', 'WITHDRAWAL', 'RETRACTION']),
  reason: z.string().trim().min(20).max(10000),
  notice: z.string().trim().min(40).max(30000),
});
const publicSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  journal: slug.optional(),
  section: slug.optional(),
  articleType: slug.optional(),
  issue: slug.optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
});

function cookie(request: RequestWithContext, name: string) {
  const item = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + '='));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

@Controller()
export class ProductionController {
  constructor(
    private readonly production: ProductionService,
    private readonly galleys: GalleyFileService,
    private readonly auth: AuthService,
  ) {}
  private async actor(request: RequestWithContext, csrf?: string) {
    const identity = await this.auth.authenticateUser(cookie(request, 'aksara_session'));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'AUTH_REQUIRED',
          'Sesi pengguna diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    if (!csrf || csrf !== cookie(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
    return identity.user.id;
  }
  private async identity(request: RequestWithContext) {
    const identity = await this.auth.authenticateUser(cookie(request, 'aksara_session'));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'AUTH_REQUIRED',
          'Sesi pengguna diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return identity.user.id;
  }
  private fail(result: unknown, request: RequestWithContext): never {
    const id = request.requestId ?? 'unknown';
    if (result === null)
      throw new ForbiddenException(
        createApiError('PRODUCTION_ACCESS_DENIED', 'Akses produksi ditolak.', id),
      );
    if (result === 'key-conflict')
      throw new ConflictException(
        createApiError(
          'PUBLICATION_IDEMPOTENCY_CONFLICT',
          'Kunci publikasi telah digunakan untuk hasil berbeda.',
          id,
        ),
      );
    throw new UnprocessableEntityException(
      createApiError(
        'PUBLICATION_NOT_READY',
        'Metadata, issue, galley, jadwal, atau state publikasi belum memenuhi syarat.',
        id,
      ),
    );
  }

  @Post('production/issues')
  async issue(
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const input = issueSchema.parse(body);
    const actorId = await this.actor(request, csrf);
    const result = await this.production.createIssue(
      input.journalId,
      actorId,
      input,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/issues/:issueId/cover/upload-authorizations')
  async authorizeCover(
    @Param('issueId') issueId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.galleys.authorizeCover(
      z.uuid().parse(issueId),
      await this.actor(request, csrf),
      coverFileSchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/issues/:issueId/cover/:fileId/complete')
  async completeCover(
    @Param('issueId') issueId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
  ) {
    const result = await this.galleys.completeCover(
      z.uuid().parse(issueId),
      z.uuid().parse(fileId),
      await this.actor(request, csrf),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/issues/:issueId/cover/approve')
  async approveCover(
    @Param('issueId') issueId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
  ) {
    const result = await this.galleys.approveCover(
      z.uuid().parse(issueId),
      await this.actor(request, csrf),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Get('production/submissions/:submissionId')
  async workspace(@Param('submissionId') submissionId: string, @Req() request: RequestWithContext) {
    const result = await this.production.workspace(
      z.uuid().parse(submissionId),
      await this.identity(request),
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Get('production/submissions/:submissionId/files/:fileId')
  async sourceFile(
    @Param('submissionId') submissionId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
    @Res() response: Response,
  ) {
    const file = await this.galleys.sourceFile(
      z.uuid().parse(submissionId),
      z.uuid().parse(fileId),
      await this.identity(request),
      request.requestId ?? 'unknown',
    );
    if (!file)
      return response.status(404).json({
        error: { code: 'PRODUCTION_FILE_NOT_FOUND', message: 'File produksi tidak ditemukan.' },
      });
    return response.redirect(302, file.url);
  }

  @Post('production/submissions/:submissionId/source-files/upload-authorizations')
  async authorizeSource(
    @Param('submissionId') submissionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.galleys.authorizeSource(
      z.uuid().parse(submissionId),
      await this.actor(request, csrf),
      sourceFileSchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/submissions/:submissionId/source-files/:fileId/complete')
  async completeSource(
    @Param('submissionId') submissionId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
  ) {
    const result = await this.galleys.completeSource(
      z.uuid().parse(submissionId),
      z.uuid().parse(fileId),
      await this.actor(request, csrf),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Get('production/worklist')
  async worklist(@Req() request: RequestWithContext) {
    return this.production.worklist(await this.identity(request));
  }

  @Post('production/submissions/:submissionId/assignments')
  async assign(
    @Param('submissionId') submissionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.production.assign(
      z.uuid().parse(submissionId),
      await this.actor(request, csrf),
      assignmentSchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/submissions/:submissionId/queries')
  async openQuery(
    @Param('submissionId') submissionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const input = querySchema.parse(body);
    const result = await this.production.openQuery(
      z.uuid().parse(submissionId),
      await this.actor(request, csrf),
      input.question,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/queries/:queryId/answer')
  async answerQuery(
    @Param('queryId') queryId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const input = answerSchema.parse(body);
    const result = await this.production.answerQuery(
      z.uuid().parse(queryId),
      await this.actor(request, csrf),
      input.response,
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/submissions/:submissionId/prepare')
  async prepare(
    @Param('submissionId') submissionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(request, csrf);
    const result = await this.production.prepare(
      z.uuid().parse(submissionId),
      actorId,
      metadataSchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/publications/:publicationId/schedule')
  async schedule(
    @Param('publicationId') publicationId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(request, csrf);
    const input = scheduleSchema.parse(body);
    const result = await this.production.schedule(
      z.uuid().parse(publicationId),
      actorId,
      input.scheduledAt,
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/publications/:publicationId/publish')
  async publish(
    @Param('publicationId') publicationId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(request, csrf);
    const input = publishSchema.parse(body);
    const result = await this.production.publish(
      z.uuid().parse(publicationId),
      actorId,
      input.idempotencyKey,
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/publications/:publicationId/updates')
  async publicationUpdate(
    @Param('publicationId') publicationId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.production.recordUpdate(
      z.uuid().parse(publicationId),
      await this.actor(request, csrf),
      publicationUpdateSchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/versions/:versionId/galleys/upload-authorizations')
  async authorizeGalley(
    @Param('versionId') versionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Body() body: unknown,
  ) {
    const actorId = await this.actor(request, csrf);
    const result = await this.galleys.authorize(
      z.uuid().parse(versionId),
      actorId,
      galleySchema.parse(body),
      request.requestId ?? 'unknown',
    );
    if (!result) this.fail(result, request);
    return result;
  }

  @Post('production/versions/:versionId/galleys/:fileId/complete')
  async completeGalley(
    @Param('versionId') versionId: string,
    @Param('fileId') fileId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
  ) {
    const actorId = await this.actor(request, csrf);
    const result = await this.galleys.complete(
      z.uuid().parse(versionId),
      z.uuid().parse(fileId),
      actorId,
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Post('production/galleys/:galleyId/approve')
  async approveGalley(
    @Param('galleyId') galleyId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrf: string | undefined,
  ) {
    const actorId = await this.actor(request, csrf);
    const result = await this.galleys.approve(
      z.uuid().parse(galleyId),
      actorId,
      request.requestId ?? 'unknown',
    );
    if (!result || typeof result === 'string') this.fail(result, request);
    return result;
  }

  @Get('public/galleys/:galleyId')
  async galley(@Param('galleyId') galleyId: string, @Res() response: Response) {
    const file = await this.galleys.publicFile(z.uuid().parse(galleyId));
    if (!file)
      return response
        .status(404)
        .json({ error: { code: 'GALLEY_NOT_FOUND', message: 'Galley publik tidak ditemukan.' } });
    return response.redirect(302, file.url);
  }

  @Get('public/issues/:issueId/cover')
  async cover(@Param('issueId') issueId: string, @Res() response: Response) {
    const file = await this.galleys.publicCover(z.uuid().parse(issueId));
    if (!file)
      return response.status(404).json({
        error: { code: 'ISSUE_COVER_NOT_FOUND', message: 'Sampul edisi tidak ditemukan.' },
      });
    return response.redirect(302, file.url);
  }

  @Get('public/articles')
  list(@Query() query: unknown) {
    const filters = publicSearchSchema.parse(query);
    return this.production.listPublic({
      query: filters.q,
      journal: filters.journal,
      section: filters.section,
      articleType: filters.articleType,
      issue: filters.issue,
      year: filters.year,
    });
  }

  @Get('public/search-facets')
  searchFacets() {
    return this.production.publicSearchFacets();
  }

  @Get('public/journals/:journalSlug/issues')
  issues(@Param('journalSlug') journalSlug: string) {
    return this.production.publicIssues(slug.parse(journalSlug));
  }

  @Get('public/journals/:journalSlug/issues/:issueSlug')
  issuePublic(@Param('journalSlug') journalSlug: string, @Param('issueSlug') issueSlug: string) {
    return this.production.publicIssue(slug.parse(journalSlug), slug.parse(issueSlug));
  }

  @Get('public/articles/:journalSlug/:articleSlug')
  article(@Param('journalSlug') journalSlug: string, @Param('articleSlug') articleSlug: string) {
    return this.production.publicArticle(slug.parse(journalSlug), slug.parse(articleSlug));
  }
}
