import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hash } from 'argon2';

import { AuthService } from '../src/modules/identity/auth.service.js';
import { MfaService } from '../src/modules/identity/mfa.service.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function codeFor(secret: string) {
  const bits = [...secret]
    .map((character) => BASE32.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

describe('administrator MFA integration', () => {
  const email = `mfa-${randomUUID()}@aksara.local`;
  const password = `Mfa-A1-${randomUUID()}`;
  const mfa = new MfaService();
  const auth = new AuthService(undefined, mfa);
  let userId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    const user = await database.user.create({
      data: {
        email,
        passwordHash: await hash(password),
        platformRole: 'PLATFORM_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await database.user.delete({ where: { id: userId } });
    delete process.env.MFA_ENCRYPTION_KEY;
    await database.$disconnect();
  });

  it('requires a one-time TOTP challenge before creating an admin session', async () => {
    const setup = await mfa.beginSetup(userId, email, `test-${randomUUID()}`);
    await expect(
      mfa.confirmSetup(userId, codeFor(setup.secret), `test-${randomUUID()}`),
    ).resolves.toEqual({ success: true });
    const login = await auth.login(email, password, `test-${randomUUID()}`);
    expect(login).toMatchObject({ mfaRequired: true });
    if (!login?.mfaRequired) return;
    const completed = await auth.completeMfaLogin(
      login.challengeToken,
      codeFor(setup.secret),
      `test-${randomUUID()}`,
    );
    expect(completed?.mfaRequired).toBe(false);
    await expect(
      auth.completeMfaLogin(login.challengeToken, codeFor(setup.secret), `test-${randomUUID()}`),
    ).resolves.toBeNull();
  });
});
