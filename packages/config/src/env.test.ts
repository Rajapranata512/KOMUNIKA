import { describe, expect, it } from 'vitest';
import { parseDeploymentEnvironment, parseEnvironment } from './env.js';

const deploymentEnvironment = {
  APP_ENV: 'staging',
  APP_BASE_URL: 'https://staging.example.test',
  API_BASE_URL: 'https://api.staging.example.test/api/v1',
  DATABASE_URL: 'postgresql://app:secret@database.example.test:5432/aksara?sslmode=require',
  REDIS_URL: 'rediss://default:secret@redis.example.test:6380',
  FILE_SCAN_MODE: 'queue',
  EMAIL_DELIVERY_MODE: 'queue',
  PUBLICATION_SCHEDULER_MODE: 'enabled',
  SESSION_SECRET: 'session-secret-with-at-least-32-characters',
  CSRF_SECRET: 'csrf-secret-with-at-least-32-characters-long', // gitleaks:allow - fictional test fixture
  MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
  OBJECT_STORAGE_REGION: 'ap-southeast-1',
  OBJECT_STORAGE_BUCKET_PRIVATE: 'aksara-staging-private',
  OBJECT_STORAGE_BUCKET_PUBLIC: 'aksara-staging-public',
  OBJECT_STORAGE_ACCESS_KEY: 'access-key',
  OBJECT_STORAGE_SECRET_KEY: 'secret-key',
  EMAIL_FROM: 'no-reply@example.test',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'smtp-password',
  ANTIVIRUS_HOST: 'clamav.internal.example.test',
  ANTIVIRUS_PORT: '3310',
  OTEL_EXPORTER_ENDPOINT: 'https://telemetry.example.test',
  ERROR_TRACKING_DSN: '',
  SENTRY_DSN: '',
};

describe('environment validation', () => {
  it('accepts TLS Redis in the canonical environment parser', () => {
    expect(parseEnvironment(deploymentEnvironment).REDIS_URL).toMatch(/^rediss:/);
  });

  it('accepts a secure staging deployment profile', () => {
    const parsed = parseDeploymentEnvironment(deploymentEnvironment);
    expect(parsed.SMTP_SECURE).toBe(true);
    expect(parsed.APP_ENV).toBe('staging');
  });

  it('accepts the Sentry Marketplace DSN as the error-tracking destination', () => {
    expect(
      parseDeploymentEnvironment({
        ...deploymentEnvironment,
        OTEL_EXPORTER_ENDPOINT: '',
        SENTRY_DSN: 'https://public@example.ingest.de.sentry.io/1',
      }).SENTRY_DSN,
    ).toContain('sentry.io');
  });

  it('rejects loopback, plaintext, disabled-worker deployment settings', () => {
    expect(() =>
      parseDeploymentEnvironment({
        ...deploymentEnvironment,
        APP_BASE_URL: 'http://localhost:3000',
        API_BASE_URL: 'http://127.0.0.1:3001/api/v1',
        DATABASE_URL: 'postgresql://app:secret@localhost:5432/aksara',
        REDIS_URL: 'redis://localhost:6379',
        FILE_SCAN_MODE: 'disabled',
        EMAIL_DELIVERY_MODE: 'development-token',
        PUBLICATION_SCHEDULER_MODE: 'disabled',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        OTEL_EXPORTER_ENDPOINT: '',
        SENTRY_DSN: '',
      }),
    ).toThrow();
  });
});
