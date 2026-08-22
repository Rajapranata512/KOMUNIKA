# Staging Verification

The staging topology must use separate accounts and resources while preserving the same boundaries as production: web, API, PostgreSQL, persistent Redis worker, private/public object storage, ClamAV, authenticated SMTP, and telemetry.

Load staging values from the deployment secret manager without writing them to a tracked file, then run:

```powershell
pnpm verify:staging
pnpm test:staging-smoke
```

`verify:staging` fails closed unless origins use HTTPS, PostgreSQL and Redis require TLS, email and file scanning use queues, the publication scheduler is enabled, SMTP is authenticated and secure, private/public buckets differ, and telemetry is configured through `SENTRY_DSN`, `ERROR_TRACKING_DSN`, or `OTEL_EXPORTER_ENDPOINT`. It reports field names and validation messages but never environment values.

`test:staging-smoke` is read-only. It checks API liveness and database readiness, public journals/articles/search, an unauthenticated private-file denial, public web routes, robots, and sitemap. A passing result does not replace worker delivery, ClamAV, SMTP, backup/PITR, or scheduled-publication drills that require operator-owned test fixtures.
