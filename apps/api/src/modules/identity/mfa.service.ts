import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { database } from '@aksara/database';
import { createApiError } from '@aksara/domain';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CHALLENGE_MS = 5 * 60 * 1000;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function base32Encode(input: Buffer) {
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5)
    output += BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(input: string) {
  const bits = [...input]
    .map((character) => BASE32.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, timeStep: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const hash = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, '0');
}

@Injectable()
export class MfaService {
  private encryptionKey(requestId: string) {
    const encoded = process.env.MFA_ENCRYPTION_KEY;
    const key = encoded ? Buffer.from(encoded, 'base64url') : Buffer.alloc(0);
    if (key.length !== 32)
      throw new ServiceUnavailableException(
        createApiError('MFA_NOT_CONFIGURED', 'MFA belum dikonfigurasi oleh operator.', requestId),
      );
    return key;
  }

  private encrypt(secret: string, requestId: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(requestId), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decrypt(value: string, requestId: string) {
    const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part!, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(requestId), iv!);
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString('utf8');
  }

  private codeValid(secret: string, code: string) {
    if (!/^\d{6}$/.test(code)) return false;
    const step = Math.floor(Date.now() / 30_000);
    return [-1, 0, 1].some((offset) => {
      const expected = Buffer.from(totp(secret, step + offset));
      const supplied = Buffer.from(code);
      return expected.length === supplied.length && timingSafeEqual(expected, supplied);
    });
  }

  async status(userId: string) {
    const credential = await database.mfaCredential.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return { enabled: Boolean(credential?.enabledAt) };
  }

  async beginSetup(userId: string, email: string, requestId: string) {
    const existing = await database.mfaCredential.findUnique({ where: { userId } });
    if (existing?.enabledAt)
      throw new BadRequestException(
        createApiError('MFA_ALREADY_ENABLED', 'MFA sudah aktif untuk akun ini.', requestId),
      );
    const secret = base32Encode(randomBytes(20));
    const secretEncrypted = this.encrypt(secret, requestId);
    await database.$transaction([
      database.mfaCredential.upsert({
        where: { userId },
        create: { userId, secretEncrypted },
        update: { secretEncrypted, enabledAt: null },
      }),
      database.auditEvent.create({
        data: {
          actorId: userId,
          action: 'identity.mfa_setup_started',
          targetType: 'User',
          targetId: userId,
          requestId,
        },
      }),
    ]);
    const label = encodeURIComponent(`Aksara Nusa Global:${email}`);
    return {
      secret,
      uri: `otpauth://totp/${label}?secret=${secret}&issuer=Aksara%20Nusa%20Global&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmSetup(userId: string, code: string, requestId: string) {
    const credential = await database.mfaCredential.findUnique({ where: { userId } });
    if (!credential || !this.codeValid(this.decrypt(credential.secretEncrypted, requestId), code))
      throw new BadRequestException(
        createApiError('MFA_CODE_INVALID', 'Kode autentikator tidak valid.', requestId),
      );
    await database.$transaction([
      database.mfaCredential.update({ where: { userId }, data: { enabledAt: new Date() } }),
      database.auditEvent.create({
        data: {
          actorId: userId,
          action: 'identity.mfa_enabled',
          targetType: 'User',
          targetId: userId,
          requestId,
        },
      }),
    ]);
    return { success: true };
  }

  async createChallenge(userId: string, requestId: string) {
    const token = randomBytes(32).toString('base64url');
    await database.$transaction([
      database.mfaChallenge.create({
        data: { userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + CHALLENGE_MS) },
      }),
      database.auditEvent.create({
        data: {
          actorId: userId,
          action: 'identity.mfa_challenge_created',
          targetType: 'User',
          targetId: userId,
          requestId,
        },
      }),
    ]);
    return token;
  }

  async verifyChallenge(token: string, code: string, requestId: string) {
    const challenge = await database.mfaChallenge.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: { include: { mfaCredential: true } } },
    });
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5 ||
      !challenge.user.mfaCredential?.enabledAt
    )
      return null;
    const valid = this.codeValid(
      this.decrypt(challenge.user.mfaCredential.secretEncrypted, requestId),
      code,
    );
    await database.mfaChallenge.update({
      where: { id: challenge.id },
      data: valid ? { usedAt: new Date() } : { attempts: { increment: 1 } },
    });
    await database.auditEvent.create({
      data: {
        actorId: challenge.userId,
        action: valid ? 'identity.mfa_challenge_succeeded' : 'identity.mfa_challenge_failed',
        targetType: 'User',
        targetId: challenge.userId,
        requestId,
      },
    });
    return valid ? challenge.user : null;
  }
}
