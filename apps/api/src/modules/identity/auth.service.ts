import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { database } from '@aksara/database';
import { hash, verify } from 'argon2';

import type { AuthenticatedAdmin, AuthenticatedUser } from './identity.types.js';
import { MfaService } from './mfa.service.js';
import {
  TransactionalEmailQueue,
  type EmailDeliveryState,
} from '../notifications/transactional-email.queue.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_DURATION_MS = 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 60 * 60 * 1000;
const PASSWORD_OPTIONS = { type: 2 as const, memoryCost: 65536, timeCost: 3, parallelism: 1 };

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly dummyHash = hash('not-a-real-password', PASSWORD_OPTIONS);

  constructor(
    @Optional() private readonly emails?: TransactionalEmailQueue,
    @Optional() private readonly mfa?: MfaService,
  ) {}

  async register(emailInput: string, password: string, requestId: string) {
    const email = emailInput.trim().toLowerCase();
    const existing = await database.user.findUnique({ where: { email } });
    if (existing) return null;
    const passwordHash = await hash(password, PASSWORD_OPTIONS);
    const token = randomBytes(32).toString('base64url');
    const user = await database.$transaction(async (transaction) => {
      const created = await transaction.user.create({ data: { email, passwordHash } });
      await transaction.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + VERIFICATION_DURATION_MS),
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: created.id,
          action: 'identity.registration_created',
          targetType: 'User',
          targetId: created.id,
          requestId,
          metadata: { deliveryState: 'pending' },
        },
      });
      return created;
    });
    const deliveryState = await this.queueIdentityEmail(
      'identity.verify-email',
      user.id,
      user.email,
      token,
      requestId,
    );
    return {
      user,
      deliveryState,
      developmentToken: deliveryState === 'development-token' ? token : undefined,
    };
  }

  async verifyEmail(token: string, requestId: string) {
    const record = await database.emailVerificationToken.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return false;
    const now = new Date();
    await database.$transaction([
      database.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      database.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } }),
      database.auditEvent.create({
        data: {
          actorId: record.userId,
          action: 'identity.email_verified',
          targetType: 'User',
          targetId: record.userId,
          requestId,
        },
      }),
    ]);
    return true;
  }

  async requestPasswordReset(emailInput: string, requestId: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await database.user.findUnique({ where: { email } });
    if (!user || user.disabledAt) return {};
    const token = randomBytes(32).toString('base64url');
    await database.$transaction([
      database.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + RESET_DURATION_MS),
        },
      }),
      database.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'identity.password_reset_requested',
          targetType: 'User',
          targetId: user.id,
          requestId,
          metadata: { deliveryState: 'pending' },
        },
      }),
    ]);
    const deliveryState = await this.queueIdentityEmail(
      'identity.password-reset',
      user.id,
      user.email,
      token,
      requestId,
    );
    return {
      deliveryState,
      developmentToken: deliveryState === 'development-token' ? token : undefined,
    };
  }

  private async queueIdentityEmail(
    event: 'identity.verify-email' | 'identity.password-reset',
    userId: string,
    recipient: string,
    token: string,
    requestId: string,
  ): Promise<EmailDeliveryState> {
    const deliveryState = this.emails
      ? await this.emails.enqueue(
          { event, recipient, token, userId, requestId, requestedAt: new Date().toISOString() },
          digest(token),
        )
      : process.env.APP_ENV === 'development'
        ? 'development-token'
        : 'disabled';

    await database.auditEvent.create({
      data: {
        actorId: userId,
        action: 'notification.transactional_email_requested',
        targetType: 'User',
        targetId: userId,
        requestId,
        metadata: { event, deliveryState },
      },
    });
    return deliveryState;
  }

  async resetPassword(token: string, password: string, requestId: string) {
    const record = await database.passwordResetToken.findUnique({
      where: { tokenHash: digest(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return false;
    const now = new Date();
    const passwordHash = await hash(password, PASSWORD_OPTIONS);
    await database.$transaction([
      database.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      database.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      database.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      database.auditEvent.create({
        data: {
          actorId: record.userId,
          action: 'identity.password_reset_completed',
          targetType: 'User',
          targetId: record.userId,
          requestId,
        },
      }),
    ]);
    return true;
  }

  async login(emailInput: string, password: string, requestId: string) {
    return this.loginWithPolicy(emailInput, password, requestId, false);
  }

  async loginAdmin(emailInput: string, password: string, requestId: string) {
    return this.loginWithPolicy(emailInput, password, requestId, true);
  }

  private async loginWithPolicy(
    emailInput: string,
    password: string,
    requestId: string,
    adminOnly: boolean,
  ) {
    const email = emailInput.trim().toLowerCase();
    const user = await database.user.findUnique({ where: { email } });
    const passwordMatches = await verify(user?.passwordHash ?? (await this.dummyHash), password);

    if (
      !user ||
      !passwordMatches ||
      user.disabledAt ||
      (!user.emailVerifiedAt && user.platformRole !== 'PLATFORM_ADMIN') ||
      (adminOnly && user.platformRole !== 'PLATFORM_ADMIN')
    ) {
      await database.auditEvent.create({
        data: {
          action: 'identity.login_failed',
          targetType: 'User',
          requestId,
          metadata: { email },
        },
      });
      return null;
    }

    if (user.platformRole === 'PLATFORM_ADMIN') {
      const credential = await database.mfaCredential.findUnique({ where: { userId: user.id } });
      if (credential?.enabledAt && this.mfa) {
        const challengeToken = await this.mfa.createChallenge(user.id, requestId);
        return { mfaRequired: true as const, challengeToken };
      }
    }
    return this.createSession(user, requestId);
  }

  async completeMfaLogin(challengeToken: string, code: string, requestId: string) {
    if (!this.mfa) return null;
    const user = await this.mfa.verifyChallenge(challengeToken, code, requestId);
    if (!user || user.disabledAt || user.platformRole !== 'PLATFORM_ADMIN') return null;
    return this.createSession(user, requestId);
  }

  private async createSession(
    user: { id: string; email: string; platformRole: 'PLATFORM_ADMIN' | null },
    requestId: string,
  ) {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await database.$transaction(async (transaction) => {
      const created = await transaction.session.create({
        data: {
          userId: user.id,
          tokenHash: digest(sessionToken),
          csrfHash: digest(csrfToken),
          expiresAt,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'identity.login_succeeded',
          targetType: 'Session',
          targetId: created.id,
          requestId,
        },
      });
      return created;
    });

    return {
      mfaRequired: false as const,
      sessionToken,
      csrfToken,
      expiresAt,
      sessionId: session.id,
      user,
    };
  }

  async authenticateUser(sessionToken?: string): Promise<AuthenticatedUser | null> {
    if (!sessionToken) return null;
    const session = await database.session.findUnique({
      where: { tokenHash: digest(sessionToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.disabledAt)
      return null;
    await database.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        platformRole: session.user.platformRole,
        emailVerified: Boolean(session.user.emailVerifiedAt),
      },
    };
  }

  async authenticate(sessionToken?: string): Promise<AuthenticatedAdmin | null> {
    if (!sessionToken) return null;
    const session = await database.session.findUnique({
      where: { tokenHash: digest(sessionToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.disabledAt ||
      session.user.platformRole !== 'PLATFORM_ADMIN'
    ) {
      return null;
    }
    await database.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return {
      sessionId: session.id,
      user: { id: session.user.id, email: session.user.email, platformRole: 'PLATFORM_ADMIN' },
    };
  }

  async logout(sessionToken: string | undefined, csrfToken: string | undefined, requestId: string) {
    if (!sessionToken || !csrfToken) return false;
    const session = await database.session.findUnique({
      where: { tokenHash: digest(sessionToken) },
    });
    if (!session) return false;
    const supplied = Buffer.from(digest(csrfToken));
    const expected = Buffer.from(session.csrfHash);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    await database.$transaction([
      database.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      database.auditEvent.create({
        data: {
          actorId: session.userId,
          action: 'identity.logout',
          targetType: 'Session',
          targetId: session.id,
          requestId,
        },
      }),
    ]);
    return true;
  }

  async listSessions(userId: string) {
    return database.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string, requestId: string) {
    const session = await database.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) return false;
    await database.$transaction([
      database.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      database.auditEvent.create({
        data: {
          actorId: userId,
          action: 'identity.session_revoked',
          targetType: 'Session',
          targetId: session.id,
          requestId,
        },
      }),
    ]);
    return true;
  }

  async listAllSessions() {
    return database.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        user: { select: { email: true } },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
  }

  async revokeAnySession(actorId: string, sessionId: string, requestId: string) {
    const session = await database.session.findFirst({ where: { id: sessionId, revokedAt: null } });
    if (!session) return false;
    await database.$transaction([
      database.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
      database.auditEvent.create({
        data: {
          actorId,
          action: 'identity.session_revoked_by_admin',
          targetType: 'Session',
          targetId: session.id,
          requestId,
          metadata: { subjectUserId: session.userId },
        },
      }),
    ]);
    return true;
  }
}
