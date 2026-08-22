# MVP Local Validation Report

- Validation date: 2026-08-22
- Environment: Windows, Node.js 20.19.0, PostgreSQL 18, Redis, SeaweedFS 4.29, Mailpit, and ClamAV
- Scope: local implementation and automated launch-readiness gates

## Passed gates

- `pnpm install --frozen-lockfile` — reproducible workspace installation passed.
- `pnpm audit --prod --audit-level high` — no known vulnerabilities found.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` — passed across all eight workspaces.
- `pnpm test` — 3 configuration, 12 domain, 10 worker, and 3 API unit tests passed; packages without unit suites exited through their explicit `--passWithNoTests` contract.
- `pnpm test:integration` — 26 API/database integration tests passed, including a real PostgreSQL readiness query.
- `pnpm db:validate` and `pnpm db:migrate:test` — Prisma schema and deterministic migration SQL passed.
- `pnpm build` — all eight workspaces passed, including the Next.js 16.3.1 production build.
- `pnpm test:e2e` — 6 specifications passed and cover all seven critical journeys required by `AGENTS.md`.
- `pnpm test:a11y` — 4 public and identity routes passed automated serious-impact axe checks.
- `pnpm test:visual` — 2 scholarly brand baselines passed.
- `pnpm test:load` — 500 requests at concurrency 25, zero failures, 35.5 ms p50, 75.4 ms p95, 241 ms maximum, and 631.7 requests/second locally.
- `pnpm test:backup-restore` — isolated logical dump/restore passed with 16 applied migrations, 51 public tables, and automatic cleanup.
- `pnpm test:object-storage-smoke` — private/public bucket access, object round-trip, cross-bucket promotion copy, and cleanup passed against SeaweedFS 4.29.
- `pnpm --filter @aksara/api test:storage-smoke` — presigned upload, storage verification, queue delivery, ClamAV content scan, and submission finalization passed against SeaweedFS 4.29.
- Isolated `postgres:18-alpine` startup — PostgreSQL 18.6 reported `/var/lib/postgresql/18/docker`, validating the Compose major-version volume mount.
- Gitleaks v8.29.1 — all 5 Git commits and the tracked/untracked worktree passed after explicitly marking one fictional test fixture.
- Trivy v0.74.0 — repository dependency/secret scan and the full PostgreSQL, Redis, SeaweedFS, Mailpit, and ClamAV CRITICAL fixed-vulnerability matrix passed. The PostgreSQL image's gosu-only `CVE-2025-68121` result is scoped by path and expires on 2026-10-15 because the gosu maintainer documents TLS findings as unreachable in that binary.

## Boundary of this report

This report does not approve legal policy, production operations, third-party backup/PITR behavior, staging parity, or a production go/no-go. Those checks require the responsible human owners and configured external infrastructure listed in `docs/launch-checklist.md`.

The staging validator, full type/lint/unit/build gates, production dependency audit, all 6 E2E specifications, local secret scans, and the current local container matrix passed after the operational automation change. The GitHub secret, configuration, and container jobs still require a repository CI run before their operator checkbox can be approved.
