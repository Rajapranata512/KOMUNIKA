import { createHash } from 'node:crypto';
import { connect } from 'node:net';

import { database } from '@aksara/database';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';

export function parseClamResponse(response: string): 'clean' | 'infected' {
  if (response.includes(' FOUND')) return 'infected';
  if (response.includes(' OK')) return 'clean';
  throw new Error('Antivirus returned an unrecognized response.');
}

function validUtf8Text(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  const decoded = buffer.toString('utf8');
  return !decoded.includes('�');
}

export function mimeMatchesContent(
  declaredMime: string,
  detectedMime: string | undefined,
  buffer: Buffer,
) {
  if (declaredMime === 'text/plain' || declaredMime === 'text/csv')
    return detectedMime === undefined && validUtf8Text(buffer);
  return declaredMime === detectedMime;
}

export async function scanWithClamAv(
  buffer: Buffer,
  host: string,
  port: number,
): Promise<'clean' | 'infected'> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const response: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(
      () => socket.destroy(new Error('Antivirus scan timed out.')),
      30_000,
    );
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk: Buffer) => {
      response.push(chunk);
      const message = Buffer.concat(response).toString('utf8');
      if (!message.includes('\0')) return;
      try {
        settled = true;
        clearTimeout(timeout);
        resolve(parseClamResponse(message));
        socket.end();
      } catch (error) {
        settled = true;
        socket.destroy();
        reject(error);
      }
    });
    socket.on('error', reject);
    socket.on('close', (hadError) => {
      clearTimeout(timeout);
      if (!hadError && !settled) {
        try {
          resolve(parseClamResponse(Buffer.concat(response).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

interface FileScanEnvironment {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  antivirusHost: string;
  antivirusPort: number;
}

export async function processFileScan(fileId: string, environment: FileScanEnvironment) {
  const file = await database.storedFile.findFirst({
    where: { id: fileId, scanStatus: 'QUARANTINED' },
  });
  if (!file) return { state: 'ignored' as const };
  const client = new S3Client({
    endpoint: environment.endpoint,
    region: environment.region,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: environment.accessKeyId,
      secretAccessKey: environment.secretAccessKey,
    },
  });
  const response = await client.send(
    new GetObjectCommand({ Bucket: environment.bucket, Key: file.storageKey }),
  );
  if (!response.Body) throw new Error('Quarantined object body is unavailable.');
  const buffer = Buffer.from(await response.Body.transformToByteArray());
  if (buffer.length !== file.size) throw new Error('Quarantined object size changed.');
  const detected = await fileTypeFromBuffer(buffer);
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');

  if (!mimeMatchesContent(file.declaredMime, detected?.mime, buffer)) {
    await database.$transaction([
      database.storedFile.update({
        where: { id: file.id },
        data: {
          detectedMime: detected?.mime,
          checksumSha256,
          scanStatus: 'REJECTED',
          scannedAt: new Date(),
        },
      }),
      database.auditEvent.create({
        data: {
          action: 'file.rejected_mime_mismatch',
          targetType: 'StoredFile',
          targetId: file.id,
          requestId: `file-scan-${file.id}`,
          metadata: { journalId: file.journalId },
        },
      }),
    ]);
    await client.send(
      new DeleteObjectCommand({ Bucket: environment.bucket, Key: file.storageKey }),
    );
    return { state: 'rejected' as const };
  }

  const result = await scanWithClamAv(buffer, environment.antivirusHost, environment.antivirusPort);
  const now = new Date();
  await database.$transaction([
    database.storedFile.update({
      where: { id: file.id },
      data: {
        detectedMime: detected?.mime ?? file.declaredMime,
        checksumSha256,
        scanStatus: result === 'clean' ? 'CLEAN' : 'INFECTED',
        scannedAt: now,
      },
    }),
    database.auditEvent.create({
      data: {
        action: result === 'clean' ? 'file.scan_clean' : 'file.scan_infected',
        targetType: 'StoredFile',
        targetId: file.id,
        requestId: `file-scan-${file.id}`,
        metadata: { journalId: file.journalId },
      },
    }),
  ]);
  if (result === 'infected')
    await client.send(
      new DeleteObjectCommand({ Bucket: environment.bucket, Key: file.storageKey }),
    );
  return { state: result };
}
