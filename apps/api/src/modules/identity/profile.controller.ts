import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createApiError } from '@aksara/domain';
import { z } from 'zod';

import { AuthService } from './auth.service.js';
import type { RequestWithContext } from './identity.types.js';
import { ProfileService } from './profile.service.js';

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  affiliation: z.string().trim().max(240).nullable(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  expertise: z.array(z.string().trim().min(2).max(80)).max(20),
  orcidId: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
    .nullable(),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  timezone: z.string().min(3).max(80),
});

function cookieValue(request: RequestWithContext, name: string): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

@Controller('users/me/profile')
export class ProfileController {
  constructor(
    private readonly auth: AuthService,
    private readonly profiles: ProfileService,
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

  @Get()
  async get(@Req() request: RequestWithContext) {
    const identity = await this.identity(request);
    return this.profiles.get(identity.user.id);
  }

  @Patch()
  async update(
    @Body() input: unknown,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const identity = await this.identity(request);
    if (!csrfToken || csrfToken !== cookieValue(request, 'aksara_csrf'))
      throw new UnauthorizedException(
        createApiError('CSRF_INVALID', 'Permintaan tidak valid.', request.requestId ?? 'unknown'),
      );
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        createApiError(
          'PROFILE_INPUT_INVALID',
          'Data profil tidak valid.',
          request.requestId ?? 'unknown',
        ),
      );
    return this.profiles.update(identity.user.id, parsed.data, request.requestId ?? 'unknown');
  }
}
