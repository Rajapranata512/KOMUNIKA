import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import {
  FILE_SCAN_JOB_OPTIONS,
  FILE_SCAN_QUEUE,
  fileScanJobId,
  type FileScanJob,
} from '@aksara/domain';
import { Queue } from 'bullmq';

function redisConnection(urlInput: string) {
  const url = new URL(urlInput);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    retryStrategy: (attempt: number) => (attempt > 2 ? null : Math.min(attempt * 250, 1_000)),
  };
}

export type ScanQueueState = 'queued' | 'disabled' | 'failed';

@Injectable()
export class FileScanQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(FileScanQueue.name);
  private queue: Queue<FileScanJob> | undefined;

  async enqueue(job: FileScanJob): Promise<ScanQueueState> {
    if (process.env.FILE_SCAN_MODE !== 'queue') return 'disabled';
    try {
      await this.getQueue().add('file.scan', job, {
        ...FILE_SCAN_JOB_OPTIONS,
        jobId: fileScanJobId(job.fileId),
      });
      return 'queued';
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'file.scan_enqueue_failed',
          fileId: job.fileId,
          journalId: job.journalId,
          requestId: job.requestId,
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
    if (!redisUrl) throw new Error('REDIS_URL is required when FILE_SCAN_MODE=queue.');
    this.queue = new Queue<FileScanJob>(FILE_SCAN_QUEUE, {
      connection: redisConnection(redisUrl),
      defaultJobOptions: FILE_SCAN_JOB_OPTIONS,
    });
    return this.queue;
  }
}
