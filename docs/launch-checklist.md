# MVP Launch Checklist

## Automated readiness

- [x] Core author, editorial, review, revision, production, reader, and denial journeys pass E2E.
- [x] Tenant isolation, reviewer anonymity, private-file authorization, decision audit, stable publication URLs, and baseline scholarly metadata have automated coverage.
- [x] Format, lint, typecheck, unit, integration, migration, production build, accessibility, and visual regression gates pass locally.
- [x] Local PostgreSQL logical backup and isolated restore drill passes.
- [x] Public read load smoke meets the recorded zero-error and p95 threshold locally.
- [x] No known unresolved critical finding remains in the implemented code path.
- [x] Production dependency audit reports no known high or critical vulnerability locally and is enforced in CI.
- [x] Fail-closed staging environment validation and read-only staging smoke automation are implemented.
- [x] PostgreSQL 18's major-version data layout passes an isolated ephemeral-container check.
- [x] The maintained local S3 emulator passes bucket, put/get, copy, cleanup, presigned upload, ClamAV, and finalization smoke checks.
- [x] Local Git-history/worktree secret scans and the current service-image CRITICAL scan matrix pass with one scoped, expiring, maintainer-backed gosu reachability exception.

## Operator and responsible-human approvals

- [ ] Staging topology matches production and passes the full smoke plan.
- [ ] Production Redis worker, object storage, ClamAV, SMTP, monitoring, and secret manager are configured and live-tested.
- [ ] Neon backup schedule/PITR capability and provider restore drill are verified and recorded.
- [ ] Dependency, container, and secret scans have no unreviewed critical result.
- [ ] Privacy notice, terms, publication ethics, retention, appeals, retraction authority, and APC policy are approved.
- [ ] Named owners exist for security incidents, editorial escalation, backups, worker failures, and publication corrections.
- [ ] Production administrator password is rotated after testing and MFA recovery material is held securely.
- [ ] Final go/no-go is recorded by the responsible product, editorial, security, and operations owners.

The unchecked items are deliberate launch blockers and cannot be self-approved by an AI coding agent.
