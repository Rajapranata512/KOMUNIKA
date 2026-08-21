import {
  FILE_SCAN_QUEUE,
  TRANSACTIONAL_EMAIL_JOB_OPTIONS,
  TRANSACTIONAL_EMAIL_QUEUE,
  transactionalEmailJobId,
  type FileScanJob,
  type TransactionalEmailJob,
} from '@aksara/domain';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';

import { deliverTransactionalEmail } from './transactional-email.js';
import { processFileScan } from './file-scan.js';
import { publishDuePublications } from './publication-scheduler.js';

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

async function startFileScanWorker() {
  const redisUrl = process.env.REDIS_URL;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  const region = process.env.OBJECT_STORAGE_REGION;
  const bucket = process.env.OBJECT_STORAGE_BUCKET_PRIVATE;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
  const antivirusHost = process.env.ANTIVIRUS_HOST;
  const antivirusPort = Number(process.env.ANTIVIRUS_PORT ?? 3310);
  if (
    !redisUrl ||
    !endpoint ||
    !region ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !antivirusHost
  )
    throw new Error('File scan worker environment is incomplete.');
  const worker = new Worker<FileScanJob>(
    FILE_SCAN_QUEUE,
    async (queueJob) => {
      const result = await processFileScan(queueJob.data.fileId, {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        antivirusHost,
        antivirusPort,
      });
      log('file.scan_completed', {
        jobId: queueJob.id,
        fileId: queueJob.data.fileId,
        journalId: queueJob.data.journalId,
        state: result.state,
      });
    },
    { connection: redisConnection(redisUrl), concurrency: 2 },
  );
  worker.on('failed', (queueJob, error) => {
    log('file.scan_failed', {
      jobId: queueJob?.id,
      fileId: queueJob?.data.fileId,
      journalId: queueJob?.data.journalId,
      attemptsMade: queueJob?.attemptsMade,
      errorType: error.name,
    });
  });
  const shutdown = () => worker.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  log('worker.file_scan_ready', { queue: FILE_SCAN_QUEUE, concurrency: 2 });
}

async function startPublicationScheduler() {
  const redisUrl = process.env.REDIS_URL;
  const emailQueue =
    process.env.EMAIL_DELIVERY_MODE === 'queue' && redisUrl
      ? new Queue<TransactionalEmailJob>(TRANSACTIONAL_EMAIL_QUEUE, {
          connection: redisConnection(redisUrl),
          defaultJobOptions: TRANSACTIONAL_EMAIL_JOB_OPTIONS,
        })
      : undefined;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await publishDuePublications(new Date(), async (job, deliveryKey) => {
        if (!emailQueue) return;
        await emailQueue.add(job.event, job, {
          ...TRANSACTIONAL_EMAIL_JOB_OPTIONS,
          jobId: transactionalEmailJobId(job.event, deliveryKey),
        });
      });
      if (result.published) log('publication.scheduler_published', result);
    } catch (error) {
      log('publication.scheduler_failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      running = false;
    }
  };
  await run();
  const timer = setInterval(() => void run(), 60_000);
  const shutdown = async () => {
    clearInterval(timer);
    await emailQueue?.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  log('worker.publication_scheduler_ready', { intervalSeconds: 60 });
}

const starters: Array<Promise<void>> = [];
if (process.env.EMAIL_DELIVERY_MODE === 'queue') starters.push(startEmailWorker());
if (process.env.FILE_SCAN_MODE === 'queue') starters.push(startFileScanWorker());
if (process.env.PUBLICATION_SCHEDULER_MODE === 'enabled')
  starters.push(startPublicationScheduler());
if (!starters.length)
  log('worker.foundation.ready', { queues: queueNames, emailDeliveryMode: 'disabled' });
await Promise.all(starters);
