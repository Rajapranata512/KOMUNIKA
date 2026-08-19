import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { database } from '@aksara/database';
import { createApiError } from '@aksara/domain';

import { AuthService } from './auth.service.js';
import type { RequestWithContext } from './identity.types.js';

function sessionCookie(request: RequestWithContext): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('aksara_session='));
  return entry ? decodeURIComponent(entry.slice('aksara_session='.length)) : undefined;
}

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly auth: AuthService) {}

  @Get('overview')
  async overview(@Req() request: RequestWithContext) {
    const identity = await this.auth.authenticate(sessionCookie(request));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'ADMIN_ACCESS_DENIED',
          'Akses administrator tidak tersedia.',
          request.requestId ?? 'unknown',
        ),
      );
    const [users, activeSessions, auditEvents] = await Promise.all([
      database.user.count(),
      database.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      database.auditEvent.count(),
    ]);
    return { administrator: identity.user, counts: { users, activeSessions, auditEvents } };
  }

  @Get('sessions')
  async sessions(@Req() request: RequestWithContext) {
    const identity = await this.auth.authenticate(sessionCookie(request));
    if (!identity)
      throw new UnauthorizedException(
        createApiError(
          'ADMIN_ACCESS_DENIED',
          'Akses administrator tidak tersedia.',
          request.requestId ?? 'unknown',
        ),
      );
    const sessions = await this.auth.listAllSessions();
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
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.auth.authenticate(sessionCookie(request));
    if (!identity || !csrfToken || csrfToken !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
    const revoked = await this.auth.revokeAnySession(
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
}
