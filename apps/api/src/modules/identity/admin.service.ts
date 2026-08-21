import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { database } from '@aksara/database';
import { createApiError } from '@aksara/domain';

@Injectable()
export class AdminService {
  async listUsers(query?: string, cursor?: string) {
    const users = await database.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { fullName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        fullName: true,
        platformRole: true,
        emailVerifiedAt: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { journalMemberships: true, sessions: true } },
      },
    });
    const nextCursor = users.length > 50 ? (users[49]?.id ?? null) : null;
    return { users: users.slice(0, 50), nextCursor };
  }

  async setDisabled(actorId: string, userId: string, disabled: boolean, requestId: string) {
    if (actorId === userId && disabled)
      throw new BadRequestException(
        createApiError(
          'ADMIN_SELF_DISABLE_FORBIDDEN',
          'Administrator tidak dapat menonaktifkan akunnya sendiri.',
          requestId,
        ),
      );
    const target = await database.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, disabledAt: true },
    });
    if (!target)
      throw new NotFoundException(
        createApiError('USER_NOT_FOUND', 'Pengguna tidak ditemukan.', requestId),
      );
    if (disabled && target.platformRole === 'PLATFORM_ADMIN') {
      const activeAdmins = await database.user.count({
        where: { platformRole: 'PLATFORM_ADMIN', disabledAt: null },
      });
      if (activeAdmins <= 1)
        throw new BadRequestException(
          createApiError(
            'LAST_ADMIN_DISABLE_FORBIDDEN',
            'Administrator aktif terakhir tidak dapat dinonaktifkan.',
            requestId,
          ),
        );
    }
    await database.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { disabledAt: disabled ? new Date() : null },
      });
      if (disabled)
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: disabled ? 'identity.user_suspended' : 'identity.user_restored',
          targetType: 'User',
          targetId: userId,
          requestId,
          metadata: {},
        },
      });
    });
    return { success: true };
  }
}
