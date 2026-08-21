export const FILE_SCAN_QUEUE = 'file-scan';

export interface FileScanJob {
  fileId: string;
  journalId: string;
  requestId: string;
  requestedAt: string;
}

export const FILE_SCAN_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400, count: 1_000 },
} as const;

export function fileScanJobId(fileId: string): string {
  return `file-scan-${fileId}`;
}
