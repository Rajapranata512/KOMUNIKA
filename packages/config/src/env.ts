import { z } from 'zod';

export const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
  APP_BASE_URL: z.url(),
  API_BASE_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  REDIS_URL: z.string().startsWith('redis://'),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET_PRIVATE: z.string().min(1),
  OBJECT_STORAGE_BUCKET_PUBLIC: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  EMAIL_FROM: z.email(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
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
