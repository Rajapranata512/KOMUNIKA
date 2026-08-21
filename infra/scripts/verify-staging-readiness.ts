import { parseDeploymentEnvironment } from '../../packages/config/src/env.js';

try {
  const environment = parseDeploymentEnvironment(process.env);
  console.log(
    JSON.stringify({
      status: 'passed',
      environment: environment.APP_ENV,
      checks: [
        'https-origins',
        'database-tls',
        'redis-tls',
        'queued-email',
        'queued-file-scan',
        'publication-scheduler',
        'authenticated-smtp-tls',
        'separate-storage-buckets',
        'telemetry',
      ],
    }),
  );
} catch (error) {
  const issues =
    typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues)
      ? error.issues.map((issue: { path?: PropertyKey[]; message?: string }) => ({
          field: issue.path?.join('.') || 'environment',
          message: issue.message ?? 'Invalid deployment setting.',
        }))
      : [{ field: 'environment', message: 'Deployment environment validation failed.' }];
  console.error(JSON.stringify({ status: 'failed', issues }));
  process.exitCode = 1;
}
