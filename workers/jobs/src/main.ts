import { TRANSACTIONAL_EMAIL_QUEUE, type TransactionalEmailJob } from '@aksara/domain';
import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';

import { deliverTransactionalEmail } from './transactional-email.js';

const queueNames = [TRANSACTIONAL_EMAIL_QUEUE, 'files', 'indexing', 'metadata', 'publication'];

function redisConnection(urlInput: string) {
  const url = new URL(urlInput);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ level: 'info', event, ...fields, timestamp: new Date().toISOString() }),
  );
}

async function startEmailWorker() {
  const redisUrl = process.env.REDIS_URL;
  const appBaseUrl = process.env.APP_BASE_URL;
  const from = process.env.EMAIL_FROM;
  const smtpHost = process.env.SMTP_HOST;
  if (!redisUrl || !appBaseUrl || !from || !smtpHost) {
    throw new Error(
      'REDIS_URL, APP_BASE_URL, EMAIL_FROM, and SMTP_HOST are required when EMAIL_DELIVERY_MODE=queue.',
    );
  }

  const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
      : {}),
  });
  await transport.verify();

  const worker = new Worker<TransactionalEmailJob>(
    TRANSACTIONAL_EMAIL_QUEUE,
    async (queueJob) => {
      await deliverTransactionalEmail(queueJob.data, appBaseUrl, from, transport);
      log('email.delivered', {
        jobId: queueJob.id,
        emailEvent: queueJob.name,
        userId: queueJob.data.userId,
      });
    },
    { connection: redisConnection(redisUrl), concurrency: 5 },
  );

  worker.on('failed', (queueJob, error) => {
    const attempts = queueJob?.opts.attempts ?? 1;
    log('email.delivery_failed', {
      jobId: queueJob?.id,
      emailEvent: queueJob?.name,
      userId: queueJob?.data.userId,
      attemptsMade: queueJob?.attemptsMade,
      final: Boolean(queueJob && queueJob.attemptsMade >= attempts),
      errorType: error.name,
    });
  });

  const shutdown = async () => {
    log('worker.shutdown_started');
    await worker.close();
    transport.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  log('worker.email_ready', { queue: TRANSACTIONAL_EMAIL_QUEUE, concurrency: 5 });
}

if (process.env.EMAIL_DELIVERY_MODE === 'queue') {
  await startEmailWorker();
} else {
  log('worker.foundation.ready', { queues: queueNames, emailDeliveryMode: 'disabled' });
}
