# Aksara Journal Platform

A professional multi-journal scholarly submission, peer-review, editorial, and publishing platform.

The approved product baseline is in `PRD.md`, the visual and interaction baseline is in
`DESIGN.md`, and repository execution rules are in `AGENTS.md`.

## Prerequisites

- Node.js 24 LTS
- pnpm 10
- Docker with Compose

## Local setup

1. Copy `.env.example` to `.env` and replace blank secrets with local-only values.
2. Run `docker compose -f infra/docker/compose.yml up -d`.
3. Run `pnpm install --frozen-lockfile` after the lockfile is generated and committed.
4. Run `pnpm db:validate`, then `pnpm dev`.

External integration credentials are optional and must remain blank until legitimate credentials
are available.

## Bootstrap administrator

Administrator credentials are never committed or supplied as defaults. After PostgreSQL is ready:

1. Apply committed migrations with `pnpm --filter @aksara/database exec prisma migrate deploy`.
2. Set `DATABASE_URL`, `ADMIN_BOOTSTRAP_EMAIL`, and a unique `ADMIN_BOOTSTRAP_PASSWORD` of at least 14 characters in the current shell or an uncommitted `.env`.
3. Run `pnpm --filter @aksara/database bootstrap:admin`.
4. Start the API and web apps, then open `http://localhost:3000/login`.

Running the bootstrap command again rotates that administrator's password and records an audit event.
