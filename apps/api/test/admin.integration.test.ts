import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminService } from '../src/modules/identity/admin.service.js';

describe('platform user administration integration', () => {
  const service = new AdminService();
  const ids: string[] = [];
  let journalId: string;

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
    const journal = await database.journal.create({
      data: {
        slug: `admin-user-${randomUUID()}`,
        title: 'Jurnal Pengujian Administrasi',
        abbreviation: 'JPA',
        description: 'Fiktif untuk pengujian integrasi.',
        scope: 'Pengujian perangkat lunak.',
        contactEmail: 'journal-admin@example.invalid',
        createdById: ids[0]!,
      },
    });
    journalId = journal.id;
    await database.journalMembership.create({
      data: { journalId, userId: ids[1]!, role: 'AUTHOR' },
    });
  });

  afterAll(async () => {
    await database.journal.deleteMany({ where: { id: journalId } });
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

  it('deletes a user without scholarly records and retains the admin audit event', async () => {
    const actorId = ids[0]!;
    const target = await database.user.create({
      data: {
        email: `disposable-user-${randomUUID()}@aksara.local`,
        passwordHash: 'integration-only',
        emailVerifiedAt: new Date(),
      },
    });
    ids.push(target.id);
    await database.session.create({
      data: {
        userId: target.id,
        tokenHash: randomUUID(),
        csrfHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const listed = await service.listUsers(target.email);
    expect(listed.users).toHaveLength(1);
    expect(listed.users[0]?.canDelete).toBe(true);

    await service.deleteUser(actorId, target.id, `test-${randomUUID()}`);

    expect(await database.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(
      await database.auditEvent.count({
        where: { actorId, targetId: target.id, action: 'identity.user_deleted' },
      }),
    ).toBe(1);
  });

  it('blocks deletion when a user has a journal record', async () => {
    await expect(
      service.deleteUser(ids[0]!, ids[1]!, `test-${randomUUID()}`),
    ).rejects.toMatchObject({
      response: { error: { code: 'USER_DELETE_BLOCKED_BY_RECORDS' } },
    });
    expect(await database.user.findUnique({ where: { id: ids[1]! } })).not.toBeNull();
  });

  it('does not allow platform administrator deletion', async () => {
    const secondAdmin = await database.user.create({
      data: {
        email: `second-admin-${randomUUID()}@aksara.local`,
        passwordHash: 'integration-only',
        platformRole: 'PLATFORM_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    ids.push(secondAdmin.id);
    await expect(
      service.deleteUser(ids[0]!, secondAdmin.id, `test-${randomUUID()}`),
    ).rejects.toMatchObject({
      response: { error: { code: 'ADMIN_DELETE_FORBIDDEN' } },
    });
  });
});
