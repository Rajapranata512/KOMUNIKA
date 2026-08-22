import { randomUUID } from 'node:crypto';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the object-storage smoke test.`);
  return value;
}

async function main() {
  const privateBucket = required('OBJECT_STORAGE_BUCKET_PRIVATE');
  const publicBucket = required('OBJECT_STORAGE_BUCKET_PUBLIC');
  const client = new S3Client({
    endpoint: required('OBJECT_STORAGE_ENDPOINT'),
    region: required('OBJECT_STORAGE_REGION'),
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY'),
      secretAccessKey: required('OBJECT_STORAGE_SECRET_KEY'),
    },
  });
  const suffix = randomUUID();
  const privateKey = `smoke/private-${suffix}.txt`;
  const publicKey = `smoke/public-${suffix}.txt`;
  const payload = `aksara-object-storage-smoke-${suffix}`;

  try {
    await client.send(new HeadBucketCommand({ Bucket: privateBucket }));
    await client.send(new HeadBucketCommand({ Bucket: publicBucket }));
    await client.send(
      new PutObjectCommand({
        Bucket: privateBucket,
        Key: privateKey,
        Body: payload,
        ContentType: 'text/plain',
      }),
    );
    const source = await client.send(
      new GetObjectCommand({ Bucket: privateBucket, Key: privateKey }),
    );
    if ((await source.Body?.transformToString()) !== payload)
      throw new Error('Private object round-trip returned unexpected content.');
    await client.send(
      new CopyObjectCommand({
        Bucket: publicBucket,
        Key: publicKey,
        CopySource: encodeURI(`${privateBucket}/${privateKey}`),
      }),
    );
    const published = await client.send(
      new GetObjectCommand({ Bucket: publicBucket, Key: publicKey }),
    );
    if ((await published.Body?.transformToString()) !== payload)
      throw new Error('Cross-bucket copy returned unexpected content.');
    console.log(JSON.stringify({ event: 'object_storage.smoke_passed' }));
  } finally {
    await Promise.allSettled([
      client.send(new DeleteObjectCommand({ Bucket: privateBucket, Key: privateKey })),
      client.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: publicKey })),
    ]);
    client.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Object-storage smoke test failed.');
  process.exitCode = 1;
});
