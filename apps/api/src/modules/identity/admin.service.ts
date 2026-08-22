import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { database, Prisma } from '@aksara/database';
import { createApiError } from '@aksara/domain';

const protectedUserRecordCount = {
  journalMemberships: true,
  journalsCreated: true,
  submissions: true,
  submissionAuthors: true,
  filesUploaded: true,
  editorialAssignments: true,
  assignmentsCreated: true,
  screeningAssessments: true,
  screeningDecisions: true,
  editorialNotes: true,
  reviewerProfiles: true,
  reviewRoundsAssigned: true,
  reviewInvitations: true,
  reviewInvitationsSent: true,
  reviewAssignments: true,
  editorialDecisions: true,
  productionAssignments: true,
  productionAssigned: true,
  productionQueriesOpened: true,
  productionQueriesAnswered: true,
  publicationVersionsCreated: true,
  publicationUpdatesCreated: true,
} as const;

function hasProtectedUserRecords(counts: Record<string, number>): boolean {
  return Object.values(counts).some((count) => count > 0);
}

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
        _count: { select: { ...protectedUserRecordCount, sessions: true } },
      },
    });
    const nextCursor = users.length > 50 ? (users[49]?.id ?? null) : null;
    return {
      users: users.slice(0, 50).map((user) => {
        const { _count, ...profile } = user;
        const protectedCounts = Object.fromEntries(
          Object.entries(_count).filter(([relation]) => relation !== 'sessions'),
        );
        return {
          ...profile,
          _count: {
            journalMemberships: _count.journalMemberships,
            sessions: _count.sessions,
          },
          canDelete: user.platformRole === null && !hasProtectedUserRecords(protectedCounts),
        };
      }),
      nextCursor,
    };
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

  async deleteUser(actorId: string, userId: string, requestId: string) {
    if (actorId === userId)
      throw new BadRequestException(
        createApiError(
          'ADMIN_SELF_DELETE_FORBIDDEN',
          'Administrator tidak dapat menghapus akunnya sendiri.',
          requestId,
        ),
      );

    try {
      await database.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              platformRole: true,
              _count: { select: protectedUserRecordCount },
            },
          });
          if (!target)
            throw new NotFoundException(
              createApiError('USER_NOT_FOUND', 'Pengguna tidak ditemukan.', requestId),
            );
          if (target.platformRole)
            throw new BadRequestException(
              createApiError(
                'ADMIN_DELETE_FORBIDDEN',
                'Akun administrator tidak dapat dihapus melalui pengelolaan pengguna.',
                requestId,
              ),
            );
          if (hasProtectedUserRecords(target._count))
            throw new ConflictException(
              createApiError(
                'USER_DELETE_BLOCKED_BY_RECORDS',
                'Akun memiliki rekam jurnal atau editorial dan harus dinonaktifkan, bukan dihapus.',
                requestId,
              ),
            );

          await tx.auditEvent.create({
            data: {
              actorId,
              action: 'identity.user_deleted',
              targetType: 'User',
              targetId: userId,
              requestId,
              metadata: {},
            },
          });
          await tx.user.delete({ where: { id: userId } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        throw new ConflictException(
          createApiError(
            'USER_DELETE_BLOCKED_BY_RECORDS',
            'Akun memiliki rekam jurnal atau editorial dan harus dinonaktifkan, bukan dihapus.',
            requestId,
          ),
        );
      throw error;
    }
    return { success: true };
  }
}
