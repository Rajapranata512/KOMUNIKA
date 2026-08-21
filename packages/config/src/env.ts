import { z } from 'zod';

export const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
  APP_BASE_URL: z.url(),
  API_BASE_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  REDIS_URL: z
    .string()
    .refine(
      (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
      'REDIS_URL must use redis:// or rediss://.',
    ),
  FILE_SCAN_MODE: z.enum(['queue', 'disabled']),
  EMAIL_DELIVERY_MODE: z.enum(['queue', 'development-token', 'disabled']),
  PUBLICATION_SCHEDULER_MODE: z.enum(['enabled', 'disabled']).default('disabled'),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.string().min(43),
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET_PRIVATE: z.string().min(1),
  OBJECT_STORAGE_BUCKET_PUBLIC: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  EMAIL_FROM: z.email(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform((value) => value === 'true'),
  ]),
  SMTP_USER: z.string(),
  SMTP_PASSWORD: z.string(),
  ANTIVIRUS_HOST: z.string().min(1),
  ANTIVIRUS_PORT: z.coerce.number().int().positive(),
  OTEL_EXPORTER_ENDPOINT: z.url().optional().or(z.literal('')),
  ERROR_TRACKING_DSN: z.url().optional().or(z.literal('')),
  ORCID_CLIENT_ID: z.string().optional(),
  ORCID_CLIENT_SECRET: z.string().optional(),
  CROSSREF_USERNAME: z.string().optional(),
  CROSSREF_PASSWORD: z.string().optional(),
  CROSSREF_PREFIX: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(14).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}

const deploymentEnvironmentSchema = environmentSchema.superRefine((environment, context) => {
  if (environment.APP_ENV !== 'staging' && environment.APP_ENV !== 'production') {
    context.addIssue({
      code: 'custom',
      path: ['APP_ENV'],
      message: 'Deployment validation requires APP_ENV=staging or production.',
    });
    return;
  }

  for (const field of ['APP_BASE_URL', 'API_BASE_URL'] as const) {
    const url = new URL(environment[field]);
    if (url.protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: [field], message: `${field} must use HTTPS.` });
    }
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} must not target a loopback host.`,
      });
    }
  }

  const databaseUrl = new URL(environment.DATABASE_URL);
  if (['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must not target a loopback host.',
    });
  }
  if (
    !['require', 'verify-ca', 'verify-full'].includes(databaseUrl.searchParams.get('sslmode') ?? '')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must require TLS through sslmode.',
    });
  }

  if (!environment.REDIS_URL.startsWith('rediss://')) {
    context.addIssue({
      code: 'custom',
      path: ['REDIS_URL'],
      message: 'Deployment Redis must use rediss://.',
    });
  }
  if (environment.FILE_SCAN_MODE !== 'queue') {
    context.addIssue({
      code: 'custom',
      path: ['FILE_SCAN_MODE'],
      message: 'File scanning must be queued.',
    });
  }
  if (environment.EMAIL_DELIVERY_MODE !== 'queue') {
    context.addIssue({
      code: 'custom',
      path: ['EMAIL_DELIVERY_MODE'],
      message: 'Transactional email must be queued.',
    });
  }
  if (environment.PUBLICATION_SCHEDULER_MODE !== 'enabled') {
    context.addIssue({
      code: 'custom',
      path: ['PUBLICATION_SCHEDULER_MODE'],
      message: 'The publication scheduler must be enabled.',
    });
  }
  if (!environment.SMTP_SECURE || !environment.SMTP_USER || !environment.SMTP_PASSWORD) {
    context.addIssue({
      code: 'custom',
      path: ['SMTP_SECURE'],
      message: 'Deployment SMTP must use TLS and authenticated credentials.',
    });
  }
  if (environment.OBJECT_STORAGE_BUCKET_PRIVATE === environment.OBJECT_STORAGE_BUCKET_PUBLIC) {
    context.addIssue({
      code: 'custom',
      path: ['OBJECT_STORAGE_BUCKET_PRIVATE'],
      message: 'Private and public object-storage buckets must be distinct.',
    });
  }
  if (!environment.OTEL_EXPORTER_ENDPOINT && !environment.ERROR_TRACKING_DSN) {
    context.addIssue({
      code: 'custom',
      path: ['OTEL_EXPORTER_ENDPOINT'],
      message: 'At least one telemetry or error-tracking destination is required.',
    });
  }
});

export function parseDeploymentEnvironment(input: Record<string, unknown>): Environment {
  return deploymentEnvironmentSchema.parse(input);
}
