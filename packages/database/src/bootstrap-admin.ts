import { hash } from 'argon2';

import { database } from './client.js';

async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required.');
  }

  if (password.length < 14) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must contain at least 14 characters.');
  }

  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const admin = await database.user.upsert({
    where: { email },
    create: { email, passwordHash, platformRole: 'PLATFORM_ADMIN', emailVerifiedAt: new Date() },
    update: {
      passwordHash,
      platformRole: 'PLATFORM_ADMIN',
      emailVerifiedAt: new Date(),
      disabledAt: null,
    },
    select: { id: true, email: true },
  });

  await database.auditEvent.create({
    data: {
      actorId: admin.id,
      action: 'identity.admin_bootstrapped',
      targetType: 'User',
      targetId: admin.id,
      requestId: `bootstrap-${Date.now()}`,
      metadata: { email: admin.email },
    },
  });

  console.log(`Platform administrator ready: ${admin.email}`);
  await database.$disconnect();
}

void bootstrapAdmin();
