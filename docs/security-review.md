# MVP Security Review

- Review date: 2026-08-22
- Scope: identity, tenant authorization, scholarly workflow, private files, publication, public responses, queues, and logs
- Status: no known unresolved critical finding in the implemented local MVP

## Verified controls

- One canonical identity system uses Argon2id passwords, hashed opaque sessions/tokens, HTTP-only cookies, CSRF validation, rate limits, account suspension, session revocation, and optional encrypted TOTP MFA for platform administrators.
- Journal authorization is deny-by-default. Unit tests pin the complete role/permission matrix; integration and browser tests cover cross-owner, cross-role, cross-journal, assigned-resource, and EIC-only actions.
- Reviewer anonymity is enforced in API projections and authorized file downloads. Cover letters, author identity in double-anonymous review, and confidential reviewer comments are excluded from unauthorized responses.
- Manuscript, review, revision, copyediting, and pending-galley objects remain private. Uploads use short-lived server-authorized URLs, HEAD verification, quarantine, content-based MIME validation, SHA-256, ClamAV, and explicit visibility promotion.
- Public publication projections use field allowlists and never return storage keys, internal actor/source IDs, idempotency keys, private author email, or unapproved file metadata.
- Public cover and galley endpoints validate published/approved state and broker access through short-lived signed server URLs; an optional unsigned public storage base cannot bypass this path.
- Publication transitions are server-authorized and audited. Only an EIC journal member can schedule or publish; publication is idempotent and published history is changed only through correction, withdrawal, or retraction records.
- Transactional jobs contain identifiers rather than manuscript, decision-letter, query, review, token, or other confidential content except opaque identity/invitation tokens where required.
- Logs and error responses were checked for secrets, passwords, session/reset values, raw storage paths, private manuscript content, and stack traces.
- `pnpm audit --prod --audit-level high` reports no known production vulnerability after patching Next.js, Nodemailer, `file-type`, and the affected transitive packages; the audit is a required CI quality gate.
- Gitleaks scans of Git history and the complete worktree report no secret finding. Trivy reports no blocking repository dependency/secret result and no unreviewed CRITICAL fixed vulnerability across the current local-service image matrix.
- The archived MinIO local emulator was replaced with pinned SeaweedFS 4.29. All host-exposed Compose ports bind to loopback, and the S3 contract plus presigned-upload/ClamAV pipeline pass end to end.

## Residual operational risks

- Production SMTP, Redis worker, object storage, antivirus, telemetry, and secret-manager configuration require operator-owned infrastructure and live verification.
- MFA is optional and currently implemented for platform administrators; enforcing MFA for editorial release roles remains a post-MVP enhancement.
- Legal/privacy text, publication policies, and named operational owners require responsible-human approval before launch.
- Dependency, container, and secret scanning must remain enabled in the hosting/repository environment; a local passing review does not replace continuous scanning.
- `.trivyignore.yaml` suppresses `CVE-2025-68121` only at `usr/local/bin/gosu` until 2026-10-15. The gosu maintainer states that TLS findings are unreachable because gosu does not invoke network/TLS code; remove the exception earlier if the official PostgreSQL image is rebuilt and re-review it before expiry.
