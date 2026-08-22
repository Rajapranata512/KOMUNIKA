import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/modules/identity/admin.service.js';

describe('platform user administration integration', () => {
  const service = new AdminService();
  const ids: string[] = [];

  beforeAll(async () => {
    for (const platformRole of ['PLATFORM_ADMIN', null] as const) {
      const user = await database.user.create({
        data: {
          email: `admin-user-${randomUUID()}@aksara.local`,
          passwordHash: 'integration-only',
          platformRole,
          emailVerifiedAt: new Date(),
        },
      });
      ids.push(user.id);
    }
  });

  afterAll(async () => {
    await database.user.deleteMany({ where: { id: { in: ids } } });
    await database.$disconnect();
  });

  it('suspends a user, revokes sessions, audits, and restores the account', async () => {
    const [actorId, targetId] = ids as [string, string];
    await database.session.create({
      data: {
        userId: targetId,
        tokenHash: randomUUID(),
        csrfHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await service.setDisabled(actorId, targetId, true, `test-${randomUUID()}`);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: targetId } })).disabledAt,
    ).not.toBeNull();
    expect(
      (await database.session.findFirstOrThrow({ where: { userId: targetId } })).revokedAt,
    ).not.toBeNull();
    await service.setDisabled(actorId, targetId, false, `test-${randomUUID()}`);
    expect(
      (await database.user.findUniqueOrThrow({ where: { id: targetId } })).disabledAt,
    ).toBeNull();
    expect(await database.auditEvent.count({ where: { actorId, targetId } })).toBe(2);
  });

  it('does not allow an administrator to suspend itself', async () => {
    const actorId = ids[0]!;
    await expect(
      service.setDisabled(actorId, actorId, true, `test-${randomUUID()}`),
    ).rejects.toMatchObject({
      response: { error: { code: 'ADMIN_SELF_DISABLE_FORBIDDEN' } },
    });
  });
});
