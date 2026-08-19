import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ProfileService } from '../src/modules/identity/profile.service.js';

describe('user profile integration', () => {
  const service = new ProfileService();
  let userId: string;

  beforeAll(async () => {
    const user = await database.user.create({
      data: {
        email: `profile-${randomUUID()}@aksara.local`,
        passwordHash: await hash(`Profile-A1-${randomUUID()}`),
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await database.user.delete({ where: { id: userId } });
    await database.$disconnect();
  });

  it('persists an owned profile and records an audit event', async () => {
    const profile = await service.update(
      userId,
      {
        fullName: 'Peneliti Fiktif',
        affiliation: 'Universitas Contoh',
        countryCode: 'ID',
        expertise: ['Metadata ilmiah', 'Sistem informasi'],
        orcidId: '0000-0002-1825-0097',
        locale: 'id-ID',
        timezone: 'Asia/Jakarta',
      },
      `profile-test-${randomUUID()}`,
    );
    expect(profile).toMatchObject({
      fullName: 'Peneliti Fiktif',
      countryCode: 'ID',
      orcidId: '0000-0002-1825-0097',
    });
    await expect(service.get(userId)).resolves.toMatchObject({
      expertise: ['Metadata ilmiah', 'Sistem informasi'],
    });
    await expect(
      database.auditEvent.count({
        where: { actorId: userId, action: 'identity.profile_updated' },
      }),
    ).resolves.toBe(1);
  });
});
