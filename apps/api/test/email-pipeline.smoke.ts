import { randomBytes, randomUUID } from 'node:crypto';

import { TransactionalEmailQueue } from '../src/modules/notifications/transactional-email.queue.js';

async function main() {
  const suffix = randomUUID();
  const recipient = `email-smoke-${suffix}@aksara.local`;
  const queue = new TransactionalEmailQueue();
  try {
    const state = await queue.enqueue(
      {
        event: 'identity.verify-email',
        recipient,
        token: randomBytes(32).toString('base64url'),
        userId: suffix,
        requestId: `email-smoke-${suffix}`,
        requestedAt: new Date().toISOString(),
      },
      suffix,
    );
    if (state !== 'queued') throw new Error(`email enqueue ended as ${state}`);
    let delivered = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch('http://127.0.0.1:8025/api/v1/messages');
      if (response.ok) {
        const body = (await response.json()) as { messages?: unknown[] };
        delivered = Boolean(
          body.messages?.some((message) => JSON.stringify(message).includes(recipient)),
        );
      }
      if (delivered) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!delivered) throw new Error('queued email did not arrive in Mailpit');
    console.log(JSON.stringify({ event: 'email.smoke_passed', state: 'delivered' }));
  } finally {
    await queue.onApplicationShutdown();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Email smoke test failed.');
  process.exitCode = 1;
});
