import { Injectable } from '@nestjs/common';
import { database } from '@aksara/database';

export interface ProfileInput {
  fullName: string;
  affiliation: string | null;
  countryCode: string | null;
  expertise: string[];
  orcidId: string | null;
  locale: string;
  timezone: string;
}

@Injectable()
export class ProfileService {
  get(userId: string) {
    return database.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        emailVerifiedAt: true,
        fullName: true,
        affiliation: true,
        countryCode: true,
        expertise: true,
        orcidId: true,
        locale: true,
        timezone: true,
      },
    });
  }

  async update(userId: string, input: ProfileInput, requestId: string) {
    return database.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: input,
        select: {
          email: true,
          emailVerifiedAt: true,
          fullName: true,
          affiliation: true,
          countryCode: true,
          expertise: true,
          orcidId: true,
          locale: true,
          timezone: true,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: userId,
          action: 'identity.profile_updated',
          targetType: 'User',
          targetId: userId,
          requestId,
          metadata: { fields: Object.keys(input) },
        },
      });
      return user;
    });
  }
}
