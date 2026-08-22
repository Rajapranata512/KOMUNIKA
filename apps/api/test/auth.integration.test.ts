import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/modules/identity/auth.service.js';
import type { TransactionalEmailQueue } from '../src/modules/notifications/transactional-email.queue.js';

describe('administrator authentication integration', () => {
  const email = `integration-${randomUUID()}@aksara.local`;
  const password = `Integration-${randomUUID()}`;
  const auth = new AuthService();
  let userId: string;

  beforeAll(async () => {
    const user = await database.user.create({
      data: {
        email,
        passwordHash: await hash(password, {
          type: 2,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
        platformRole: 'PLATFORM_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await database.user.delete({ where: { id: userId } });
    await database.$disconnect();
  });

  it('creates a hashed session, authenticates it, and revokes it with CSRF', async () => {
    const login = await auth.login(email, password, `integration-${randomUUID()}`);
    expect(login).not.toBeNull();
    if (!login) return;

    const storedSession = await database.session.findUniqueOrThrow({
      where: { id: login.sessionId },
    });
    expect(storedSession.tokenHash).not.toContain(login.sessionToken);

    const identity = await auth.authenticate(login.sessionToken);
    expect(identity?.user).toMatchObject({ email, platformRole: 'PLATFORM_ADMIN' });

    await expect(
      auth.logout(login.sessionToken, login.csrfToken, `integration-${randomUUID()}`),
    ).resolves.toBe(true);
    await expect(auth.authenticate(login.sessionToken)).resolves.toBeNull();

    const actions = await database.auditEvent.findMany({
      where: { actorId: userId },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['identity.login_succeeded', 'identity.logout']),
    );
  });
});

describe('general identity lifecycle integration', () => {
  const email = `reader-${randomUUID()}@aksara.local`;
  const initialPassword = `Initial-A1-${randomUUID()}`;
  const replacementPassword = `Replacement-A1-${randomUUID()}`;
  const enqueue = vi.fn().mockResolvedValue('development-token');
  const auth = new AuthService({ enqueue } as unknown as TransactionalEmailQueue);
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) await database.user.delete({ where: { id: userId } });
    await database.$disconnect();
  });

  it('registers, verifies, manages sessions, and resets password once', async () => {
    const previousEnvironment = process.env.APP_ENV;
    process.env.APP_ENV = 'development';
    try {
      const registration = await auth.register(
        email,
        initialPassword,
        `integration-${randomUUID()}`,
      );
      expect(registration?.developmentToken).toBeTruthy();
      if (!registration?.developmentToken) return;
      userId = registration.user.id;

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'identity.verify-email',
          recipient: email,
          userId,
        }),
        expect.not.stringContaining(registration.developmentToken),
      );

      const storedVerification = await database.emailVerificationToken.findFirstOrThrow({
        where: { userId },
      });
      expect(storedVerification.tokenHash).not.toContain(registration.developmentToken);
      const unverifiedLogin = await auth.login(
        email,
        initialPassword,
        `integration-${randomUUID()}`,
      );
      expect(unverifiedLogin).not.toBeNull();
      if (unverifiedLogin) {
        await expect(auth.authenticateUser(unverifiedLogin.sessionToken)).resolves.toMatchObject({
          user: { emailVerified: false },
        });
        await expect(
          auth.logout(
            unverifiedLogin.sessionToken,
            unverifiedLogin.csrfToken,
            `integration-${randomUUID()}`,
          ),
        ).resolves.toBe(true);
      }
      await expect(
        auth.verifyEmail(registration.developmentToken, `integration-${randomUUID()}`),
      ).resolves.toBe(true);
      await expect(
        auth.verifyEmail(registration.developmentToken, `integration-${randomUUID()}`),
      ).resolves.toBe(false);

      const login = await auth.login(email, initialPassword, `integration-${randomUUID()}`);
      expect(login).not.toBeNull();
      if (!login) return;
      const sessions = await auth.listSessions(userId);
      expect(sessions.some(({ id }) => id === login.sessionId)).toBe(true);

      const resetRequest = await auth.requestPasswordReset(email, `integration-${randomUUID()}`);
      expect(resetRequest.developmentToken).toBeTruthy();
      if (!resetRequest.developmentToken) return;
      expect(enqueue).toHaveBeenLastCalledWith(
        expect.objectContaining({ event: 'identity.password-reset', recipient: email, userId }),
        expect.not.stringContaining(resetRequest.developmentToken),
      );
      await expect(
        auth.resetPassword(
          resetRequest.developmentToken,
          replacementPassword,
          `integration-${randomUUID()}`,
        ),
      ).resolves.toBe(true);
      await expect(auth.authenticateUser(login.sessionToken)).resolves.toBeNull();
      await expect(
        auth.resetPassword(
          resetRequest.developmentToken,
          replacementPassword,
          `integration-${randomUUID()}`,
        ),
      ).resolves.toBe(false);
      await expect(
        auth.login(email, replacementPassword, `integration-${randomUUID()}`),
      ).resolves.not.toBeNull();
    } finally {
      process.env.APP_ENV = previousEnvironment;
    }
  });
});
