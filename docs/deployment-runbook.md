# Deployment Runbook

## Topology

- Next.js web and NestJS REST API: immutable Vercel deployments.
- PostgreSQL: Neon production database with controlled Prisma migrations.
- Long-running jobs: a persistent Node worker with Redis/BullMQ; this must not run as a Vercel request function.
- Files: private and public S3-compatible buckets, CORS restricted to approved app origins, and no anonymous access to the private bucket.
- Supporting services: ClamAV reachable only by the worker, transactional SMTP, error tracking, and structured logs.

Staging must use the same component boundaries and security settings as production with separate accounts, databases, buckets, queues, SMTP sandbox, and secrets.

The local PostgreSQL 18 Compose service mounts its named volume at `/var/lib/postgresql`, allowing the image to maintain its major-version-specific data directory. The former `postgres_data` volume is intentionally not deleted automatically; inspect or archive it before manual cleanup.

Local S3 compatibility uses pinned SeaweedFS 4.29 with both buckets kept non-anonymous because public downloads are brokered through short-lived signed URLs. Run `pnpm test:object-storage-smoke` after changing the emulator or AWS SDK. The former MinIO named volume is intentionally preserved outside the active Compose definition; inspect or archive it before manual cleanup.

## Release procedure

1. Confirm PRD/Design synchronization, approved change scope, green CI, dependency/container/secret scans, backup health, and a recent restore drill. Load staging secrets and run `pnpm verify:staging` before rollout.
2. Build immutable artifacts from the reviewed commit. Do not build production from an uncommitted worktree.
3. Deploy the API artifact without shifting traffic.
4. Run `prisma migrate deploy` as a controlled one-off step using the production `DATABASE_URL`; capture output. Use forward-fix migrations and never edit an applied migration.
5. Start/upgrade the persistent worker with `EMAIL_DELIVERY_MODE=queue`, `FILE_SCAN_MODE=queue`, and `PUBLICATION_SCHEDULER_MODE=enabled`; verify Redis, SMTP, object storage, and ClamAV health.
6. Shift API traffic, then deploy the web artifact with its exact API base URL and canonical app URL.
7. Run `pnpm test:staging-smoke`, then smoke-test worker queue delivery, file scan, SMTP delivery, and one staging publication schedule with operator-owned fixtures.
8. Monitor error rate, latency, failed jobs, database connections, storage errors, and email delivery. Stop rollout on security, migration, or integrity anomalies.

## Rollback and forward fix

- Roll web/API traffic back to the prior immutable artifact only when the database contract remains backward compatible.
- Do not roll back a destructive schema migration. Disable the affected path and ship a reviewed forward-fix migration.
- Pause workers before reverting code that changes job payloads. Preserve failed jobs for diagnosis.
- If confidentiality may be affected, revoke sessions/URLs, restrict the affected bucket or route, preserve audit evidence, and follow the incident process.

## Required environment validation

Validate all variables through `@aksara/config`; secrets must come from the hosting secret manager. Rotate bootstrap admin credentials after acceptance testing. Never place real values in `.env.example`, Git, deployment logs, screenshots, or support messages.
