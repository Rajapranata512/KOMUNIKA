import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { createApiError } from '@aksara/domain';
import type { Response } from 'express';
import { z } from 'zod';

import { AuthService } from './auth.service.js';
import type { RequestWithContext } from './identity.types.js';
import { LoginRateLimitService } from './rate-limit.service.js';

const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(256) });
const passwordSchema = z.string().min(12).max(256).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const registerSchema = z.object({ email: z.email(), password: passwordSchema });
const tokenSchema = z.object({ token: z.string().min(32).max(256) });
const resetSchema = tokenSchema.extend({ password: passwordSchema });

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: LoginRateLimitService,
  ) {}

  private setSessionCookies(
    response: Response,
    result: { sessionToken: string; csrfToken: string; expiresAt: Date },
  ) {
    const secure = process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';
    response.cookie('aksara_session', result.sessionToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
    response.cookie('aksara_csrf', result.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
  }

  @Post('register')
  async register(@Body() input: unknown, @Req() request: RequestWithContext) {
    const requestId = request.requestId ?? 'unknown';
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'AUTH_REGISTRATION_INVALID',
          'Gunakan email valid dan password minimal 12 karakter yang berisi huruf besar, huruf kecil, dan angka.',
          requestId,
        ),
      );
    if (!this.limiter.consume(`register:${request.ip}:${parsed.data.email.toLowerCase()}`))
      throw new HttpException(
        createApiError(
          'AUTH_RATE_LIMITED',
          'Terlalu banyak percobaan. Coba kembali nanti.',
          requestId,
        ),
        429,
      );
    const result = await this.auth.register(parsed.data.email, parsed.data.password, requestId);
    if (!result)
      throw new ConflictException(
        createApiError('AUTH_EMAIL_ALREADY_REGISTERED', 'Email sudah terdaftar.', requestId),
      );
    return {
      user: { email: result.user.email, emailVerified: false },
      verificationDelivery: result.deliveryState,
      ...(result.developmentToken ? { developmentToken: result.developmentToken } : {}),
    };
  }

  @Post('email-verifications')
  async verifyEmail(@Body() input: unknown, @Req() request: RequestWithContext) {
    const parsed = tokenSchema.safeParse(input);
    const valid =
      parsed.success &&
      (await this.auth.verifyEmail(parsed.data.token, request.requestId ?? 'unknown'));
    if (!valid)
      throw new BadRequestException(
        createApiError(
          'AUTH_VERIFICATION_TOKEN_INVALID',
          'Token verifikasi tidak valid atau telah kedaluwarsa.',
          request.requestId ?? 'unknown',
        ),
      );
    return { success: true };
  }

  @Post('password-resets')
  async passwordReset(@Body() input: unknown, @Req() request: RequestWithContext) {
    const requestId = request.requestId ?? 'unknown';
    const requestParsed = z.object({ email: z.email() }).safeParse(input);
    if (requestParsed.success) {
      const result = await this.auth.requestPasswordReset(requestParsed.data.email, requestId);
      return {
        accepted: true,
        delivery: 'pending',
        ...(result.developmentToken ? { developmentToken: result.developmentToken } : {}),
      };
    }
    const resetParsed = resetSchema.safeParse(input);
    const valid =
      resetParsed.success &&
      (await this.auth.resetPassword(resetParsed.data.token, resetParsed.data.password, requestId));
    if (!valid)
      throw new BadRequestException(
        createApiError(
          'AUTH_RESET_TOKEN_INVALID',
          'Token reset tidak valid atau telah kedaluwarsa.',
          requestId,
        ),
      );
    return { success: true };
  }

  @Post('login')
  async userLogin(
    @Body() input: unknown,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.performLogin(input, request, response, false);
  }

  @Post('admin/login')
  async login(
    @Body() input: unknown,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.performLogin(input, request, response, true);
  }

  private async performLogin(
    input: unknown,
    request: RequestWithContext,
    response: Response,
    adminOnly: boolean,
  ) {
    const requestId = request.requestId ?? 'unknown';
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success)
      throw new UnauthorizedException(
        createApiError('AUTH_INVALID_CREDENTIALS', 'Email atau password tidak valid.', requestId),
      );
    const key = `${request.ip}:${parsed.data.email.toLowerCase()}`;
    if (!this.limiter.consume(key))
      throw new HttpException(
        createApiError(
          'AUTH_RATE_LIMITED',
          'Terlalu banyak percobaan masuk. Coba kembali nanti.',
          requestId,
        ),
        429,
      );
    const result = adminOnly
      ? await this.auth.loginAdmin(parsed.data.email, parsed.data.password, requestId)
      : await this.auth.login(parsed.data.email, parsed.data.password, requestId);
    if (!result)
      throw new UnauthorizedException(
        createApiError('AUTH_INVALID_CREDENTIALS', 'Email atau password tidak valid.', requestId),
      );
    this.setSessionCookies(response, result);
    return { user: { email: result.user.email, platformRole: result.user.platformRole } };
  }

  @Get('me')
  async me(@Req() request: RequestWithContext) {
    const identity = await this.auth.authenticateUser(cookieValue(request, 'aksara_session'));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'AUTH_REQUIRED',
          'Sesi pengguna diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return { user: identity.user };
  }

  @Get('sessions')
  async sessions(@Req() request: RequestWithContext) {
    const identity = await this.auth.authenticateUser(cookieValue(request, 'aksara_session'));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'AUTH_REQUIRED',
          'Sesi pengguna diperlukan.',
          request.requestId ?? 'unknown',
        ),
      );
    const sessions = await this.auth.listSessions(identity.user.id);
    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === identity.sessionId,
      })),
    };
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrfToken: string | undefined,
  ) {
    const identity = await this.auth.authenticateUser(cookieValue(request, 'aksara_session'));
    if (!identity || !csrfToken || csrfToken !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
    const revoked = await this.auth.revokeSession(
      identity.user.id,
      sessionId,
      request.requestId ?? 'unknown',
    );
    if (!revoked)
      throw new BadRequestException(
        createApiError(
          'SESSION_NOT_FOUND',
          'Sesi tidak ditemukan.',
          request.requestId ?? 'unknown',
        ),
      );
    return { success: true };
  }

  @Post('logout')
  async logout(
    @Req() request: RequestWithContext,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const valid = await this.auth.logout(
      cookieValue(request, 'aksara_session'),
      csrfToken,
      request.requestId ?? 'unknown',
    );
    if (!valid)
      throw new UnauthorizedException(
        createApiError(
          'CSRF_INVALID',
          'Permintaan keluar tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    response.clearCookie('aksara_session', { path: '/' });
    response.clearCookie('aksara_csrf', { path: '/' });
    return { success: true };
  }
}
