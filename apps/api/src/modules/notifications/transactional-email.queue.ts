import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import {
  TRANSACTIONAL_EMAIL_JOB_OPTIONS,
  TRANSACTIONAL_EMAIL_QUEUE,
  transactionalEmailJobId,
  type TransactionalEmailJob,
} from '@aksara/domain';
import { Queue } from 'bullmq';

export type EmailDeliveryState = 'queued' | 'development-token' | 'disabled' | 'failed';

function redisConnection(urlInput: string) {
  const url = new URL(urlInput);
  const databaseNumber = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(databaseNumber) || databaseNumber < 0) {
    throw new Error('REDIS_URL contains an invalid database number.');
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: databaseNumber,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    retryStrategy: (attempt: number) => (attempt > 2 ? null : Math.min(attempt * 250, 1_000)),
  };
}

@Injectable()
export class TransactionalEmailQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(TransactionalEmailQueue.name);
  private queue: Queue<TransactionalEmailJob> | undefined;

  async enqueue(job: TransactionalEmailJob, deliveryKey: string): Promise<EmailDeliveryState> {
    const mode =
      process.env.EMAIL_DELIVERY_MODE ??
      (process.env.APP_ENV === 'development' ? 'development-token' : 'disabled');
    if (mode === 'development-token') return 'development-token';
    if (mode !== 'queue') return 'disabled';

    try {
      await this.getQueue().add(job.event, job, {
        ...TRANSACTIONAL_EMAIL_JOB_OPTIONS,
        jobId: transactionalEmailJobId(job.event, deliveryKey),
      });
      return 'queued';
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'email.enqueue_failed',
          emailEvent: job.event,
          requestId: job.requestId,
          userId: job.userId,
          errorType: error instanceof Error ? error.name : 'unknown',
        }),
      );
      return 'failed';
    }
  }

  async onApplicationShutdown() {
    await this.queue?.close();
  }

  private getQueue() {
    if (this.queue) return this.queue;
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is required when EMAIL_DELIVERY_MODE=queue.');
    this.queue = new Queue<TransactionalEmailJob>(TRANSACTIONAL_EMAIL_QUEUE, {
      connection: redisConnection(redisUrl),
      defaultJobOptions: TRANSACTIONAL_EMAIL_JOB_OPTIONS,
    });
    return this.queue;
  }
}
