# AGENTS.md

> **Mandatory entry point for every AI coding agent working in this repository.**
>
> This file controls execution order, source-of-truth rules, documentation synchronization, token discipline, engineering quality, and completion criteria.

## 0. Mission

Build and maintain a professional scholarly journal submission, peer-review, editorial, and publishing platform as defined by `PRD.md` and visually governed by `DESIGN.md`.

The platform must feel like credible academic publishing infrastructure. It must not imitate Scopus or SINTA branding, falsely claim indexing, or behave like a generic AI-generated dashboard template.

---

## 1. Required Reading Order

At the beginning of a new repository session, read in this exact order:

1. `AGENTS.md`
2. `PRD.md`
3. `DESIGN.md`
4. Relevant source files, tests, migrations, and recent Git diff

Do not start implementation before steps 1–3 are complete.

For later tasks in the same session:

- Do not repeatedly reread all three documents.
- Reopen only the sections relevant to the current task.
- Recheck the Git diff before editing shared contracts, schemas, or design tokens.

---

## 2. Source-of-Truth Hierarchy

When instructions conflict, use this order:

1. The user's latest explicit instruction for the current task
2. `AGENTS.md` for process and execution behavior
3. `PRD.md` for product scope, architecture, domain rules, data, security, and acceptance criteria
4. `DESIGN.md` for visual language, UX behavior, components, responsiveness, and accessibility
5. Automated tests and API contracts
6. Existing implementation
7. Comments, TODOs, examples, mockups, and assumptions

Existing code is not automatically correct. If code conflicts with an approved requirement, fix the code.

If the user's request intentionally changes product behavior, architecture, or design direction, update the relevant documentation in the same task.

---

## 3. Autonomous Execution Rule

Proceed without asking repeated clarification questions when a safe default already exists in `PRD.md` or `DESIGN.md`.

Ask a question only when implementation is blocked by one of these conditions:

- a required secret, credential, paid account, domain, or external legal identity is missing;
- two mutually exclusive business decisions have materially different outcomes and no documented default exists;
- the requested change would delete production data, rewrite public history, or break backward compatibility;
- the request conflicts with security, privacy, publication ethics, or applicable law.

When blocked, complete all non-blocked work first and clearly mark the remaining dependency.

Never fabricate:

- DOI registrations;
- Crossref, Scopus, SINTA, DOAJ, or other indexer acceptance;
- plagiarism-check results;
- reviewer identities or review completion;
- email delivery;
- production deployment success;
- external API credentials.

### Conservative implementation decisions

When a small technical detail is not explicitly specified, choose the most conservative option that, in order:

1. preserves security and privacy;
2. preserves data and scholarly-record integrity;
3. matches the approved architecture and existing canonical patterns;
4. minimizes complexity and operational burden;
5. keeps documented future extension possible without pre-building it;
6. follows stable framework practices.

Do not stop for confirmation on trivial implementation details. Ask only when the decision materially changes product behavior, ownership, security, billing, legal behavior, backward compatibility, or architecture.

---

## 4. One-Pass Task Protocol

For every task, follow this sequence.

### Step 1 — Classify

Classify the request as one or more of:

- Product or business rule
- Backend or API
- Database or migration
- Frontend or interaction
- Visual design
- Infrastructure, CI, or CD
- Security or privacy
- Test or quality improvement
- Documentation only

### Step 2 — Locate the governing specification

Use the smallest relevant section:

- Product and architecture: `PRD.md`
- Visual and interaction: `DESIGN.md`
- Execution and quality gates: `AGENTS.md`

Do not generate a new product analysis if the decision is already documented.

### Step 3 — Inspect before editing

Inspect:

- current implementation;
- adjacent modules;
- schemas and migrations;
- API types and shared contracts;
- tests covering the behavior;
- current Git diff.

Reuse existing patterns when they are consistent with the specifications.

### Step 4 — Make a minimal implementation plan

Plan only the files and contracts that need to change. Avoid speculative refactors.

### Step 5 — Implement vertically

A vertical slice includes all layers necessary for a usable feature:

- authorization;
- validation;
- database change;
- domain/service logic;
- API contract;
- UI and states;
- tests;
- audit event where required;
- documentation update when required.

Do not leave fake buttons, dead controls, or UI-only features that are not connected to real behavior.

### Step 6 — Validate

Run the relevant checks from Section 15. Fix failures caused by the task.

### Step 7 — Synchronize documentation

For every material implementation task, update the implementation progress tracker in `PRD.md` before reporting completion. Mark only behavior that exists and has passed its applicable checks.

Update the product-contract sections of `PRD.md` or `DESIGN.md` only when the implemented system intentionally changes a documented product or design contract.

### Step 8 — Report once

Return a concise completion summary containing:

- what changed;
- important technical decisions;
- tests run and results;
- migrations or environment changes;
- any real blocker or residual risk;
- one recommended next step selected from the earliest incomplete dependency in the MVP delivery order.

Do not repeat the entire analysis in the final report.

---

## 5. Token and Context Discipline

The agent must actively minimize repetitive work.

### Required behavior

- Search headings or symbols before reading full files.
- Read only relevant code ranges after the initial repository orientation.
- Use existing schemas, generated types, and shared constants instead of restating them.
- Prefer modifying one canonical component over copying variations.
- Prefer one recommended implementation over listing many alternatives.
- Do not restate the PRD in task plans.
- Do not regenerate files that are already correct.
- Do not rewrite changelogs or untouched sections.
- Avoid broad dependency upgrades during unrelated feature work.

### Prohibited behavior

- Reanalyzing the entire platform for every small task.
- Creating duplicate service, DTO, hook, utility, component, or design token files.
- Repeating the same business rule in frontend, backend, and documentation as independent hard-coded strings.
- Adding abstractions “for future use” without a current requirement.
- Creating microservices, event buses, or distributed infrastructure for problems already solved inside the modular monolith.
- Producing long speculative TODO lists instead of completing the requested slice.

### Canonical locations

Keep shared knowledge in one place:

- Domain enums and workflow transitions: shared domain package
- API schemas: OpenAPI source and generated client types
- Validation: server-side canonical schemas, reused by frontend where safe
- Design tokens: global theme file
- Roles and permissions: centralized authorization policy
- Email event names: centralized notification catalog
- Environment variables: validated environment schema and `.env.example`

### Coding standards

- Use strict TypeScript and avoid `any` unless unavoidable and documented.
- Keep business rules out of UI components and transport/controller layers.
- Prefer focused functions, descriptive names, and files with one clear responsibility.
- Do not duplicate validation or business rules across layers without a documented reason.
- Follow the repository formatter, linter, and generated-contract workflow.

---

## 6. Documentation Synchronization Policy

Documentation changes are deliberate, not automatic noise.

### Always update implementation status

After every material code, schema, infrastructure, security, or UI change:

- update the canonical implementation progress tracker in `PRD.md` in the same task;
- use only `Not started`, `In progress`, `Blocked`, or `Completed`;
- mark `Completed` only when the implementation and all applicable validation gates pass;
- record the exact validation limitation when status is `Blocked` or `In progress`;
- update the PRD `Last updated` date and add one concise changelog entry;
- never infer completion from files existing, a server starting, or a UI being visible alone.

This progress update is required even when the product contract itself did not change. Do not edit unrelated requirement prose merely to record progress.

### Update `PRD.md` when any of these change

- user role or permission;
- editorial workflow state or transition;
- functional requirement or acceptance criterion;
- API boundary or architectural decision;
- database entity or ownership rule at a conceptual level;
- external integration behavior;
- security, privacy, retention, or audit requirement;
- deployment topology or supported environment.

### Update `DESIGN.md` when any of these change

- design direction or brand personality;
- typography, color, spacing, radius, shadows, or motion token;
- page layout or navigation model;
- reusable component behavior;
- accessibility standard or responsive behavior;
- empty, loading, error, or permission state convention.

### Do not update either document for

- typo-only code changes;
- refactors with no behavioral or visual change;
- test-only improvements;
- patch-level dependency updates;
- internal implementation details already covered by an existing rule.

### How to update

- Edit only affected sections.
- Update the document's `Last updated` date.
- Add one short entry to its changelog.
- Never duplicate the same decision in both documents. Cross-reference instead.

### Updating `AGENTS.md`

Update this file only when a durable execution rule, architectural guardrail, quality gate, or source-of-truth policy changes. Product scope belongs in `PRD.md`; visual and interaction contracts belong in `DESIGN.md`.

Do not update `AGENTS.md` for ordinary feature delivery, local fixes, isolated endpoint additions, spacing changes, or implementation details already governed elsewhere. This prevents documentation drift and keeps the mandatory entry point compact.

---

## 7. Architecture Guardrails

The approved architecture is a TypeScript modular monolith in a monorepo.

### Required repository shape

```text
/
├─ AGENTS.md
├─ PRD.md
├─ DESIGN.md
├─ apps/
│  ├─ web/                 # Next.js public site and authenticated UI
│  └─ api/                 # NestJS REST API and background-job producers
├─ packages/
│  ├─ ui/                  # Shared UI primitives and design tokens
│  ├─ domain/              # Enums, state-machine rules, permission vocabulary
│  ├─ api-client/          # Generated or strongly typed API client
│  ├─ config/              # Shared TypeScript, lint, test configuration
│  └─ database/            # Prisma schema, migrations, seed helpers
├─ workers/
│  └─ jobs/                # Queue consumers for email, files, exports, indexing
├─ infra/
│  ├─ docker/
│  └─ github/
├─ docs/
└─ tests/
   └─ e2e/
```

Equivalent organization is acceptable only when it preserves the same boundaries and is documented.

### Module boundaries

Backend modules should follow the domain, not technical layers alone:

- identity and access;
- journals and configuration;
- submissions;
- editorial screening;
- peer review;
- decisions and revisions;
- copyediting and production;
- issues and publication;
- files and storage;
- notifications;
- search and discovery;
- integrations;
- audit and reporting.

Modules communicate through explicit service contracts. Avoid importing another module's internal repository implementation.

### No premature microservices

Do not split a module into a separate service unless there is measured evidence of an independent scaling, security, team-ownership, or availability requirement.

### One identity system

Use one authentication system and one canonical `/login` entry point for public users, authors, reviewers, editors, journal managers, and platform administrators. Route authenticated users to the appropriate workspace using centralized permissions and resource scope. Do not introduce separate passwords, user tables, or login stacks for CMS or administrative areas.

### Structured CMS

The CMS manages structured journal content; it is not a free-form page builder. Application code owns layout, responsive behavior, accessibility, and design consistency. Rich content must be sanitized, and arbitrary executable HTML or JavaScript is prohibited.

---

## 8. Domain Integrity Rules

The scholarly workflow is a state machine, not a freely editable status field.

### Mandatory principles

- Every status transition must be authorized and validated server-side.
- Every editorial decision records actor, timestamp, round, reason or letter, and resulting state.
- A reviewer must not access submissions outside their assignment.
- Blind-review identity rules must be enforced by the API and file access layer, not only hidden in the UI.
- Published records are versioned and auditable.
- Retraction, withdrawal, and correction do not silently delete publication history.
- File visibility is explicit: private, restricted-to-editorial-team, reviewer-visible, author-visible, or public.
- Journal-level configuration must never leak between journals.
- All tenant-owned records include and validate `journalId`.

Never bypass the workflow with direct database updates in application code.

---

## 9. Security and Privacy Rules

Security is part of every feature.

### Authentication

- Use secure, HTTP-only cookies for browser sessions.
- Never store bearer tokens in `localStorage`.
- Hash passwords with Argon2id using a reviewed configuration.
- Hash opaque session tokens before persistence.
- Require email verification before manuscript submission.
- Rate-limit login, reset, invitation, submission, and upload endpoints.
- Require stronger protection for editors and administrators; MFA support is a priority enhancement.

### Authorization

- Enforce RBAC plus resource-level ownership checks.
- Treat frontend route guards as convenience only.
- Deny by default.
- Test cross-role and cross-journal access failures.

### Files

- Source manuscripts and review files are private by default.
- Use server-authorized presigned upload/download flows.
- Validate MIME type using file content, not extension alone.
- Enforce size and type limits.
- Store SHA-256 checksum, uploader, visibility, and scan status.
- Quarantine files until antivirus scanning succeeds.
- Never expose raw storage bucket paths.

### Data

- Never log passwords, sessions, reset tokens, manuscript contents, confidential reviews, or secrets.
- Redact sensitive fields from error telemetry.
- Use append-only audit records for privileged actions.
- Use UTC in storage and ISO 8601 at API boundaries.
- Display dates in the user's selected locale and timezone.

### Secrets

- Secrets belong in environment or secret-manager configuration.
- Keep `.env.example` complete but value-free.
- Never commit real credentials.

---

## 10. Database and Migration Rules

- PostgreSQL is the system of record.
- Use foreign keys, unique constraints, and check constraints where they strengthen integrity.
- Use transactions for multi-record workflow changes.
- Add indexes based on actual query patterns.
- Use soft deletion only where recovery or auditability requires it.
- Never soft-delete append-only audit records.
- Published scholarly metadata should be versioned rather than overwritten without history.
- Every migration must be deterministic and committed.
- Separate schema migration from risky data backfill when practical.
- Production migration plans must include rollback or forward-fix strategy.
- Seed data must be obviously fictional and must never claim real indexing or DOI ownership.

Before changing a schema:

1. inspect current migrations;
2. identify affected API contracts and queries;
3. add or update migration tests;
4. update fixtures and seeds;
5. document operational impact if non-trivial.

---

## 11. API Rules

- Use REST with versioned `/api/v1` routes.
- Generate and maintain OpenAPI documentation from backend contracts.
- Use consistent resource naming and HTTP semantics.
- Validate every external input.
- Use cursor pagination for large operational lists and search results.
- Use idempotency keys for submission finalization, invitation acceptance, publication, DOI-deposit requests, and payment-related features if later introduced.
- Return stable machine-readable error codes in addition to human-readable messages.
- Never expose internal stack traces.
- Do not return confidential review data to unauthorized roles, even if the frontend does not render it.

Preferred error shape:

```json
{
  "error": {
    "code": "SUBMISSION_TRANSITION_NOT_ALLOWED",
    "message": "This submission cannot move to review from its current state.",
    "details": {},
    "requestId": "req_..."
  }
}
```

---

## 12. Frontend and Design Rules

All visual implementation must follow `DESIGN.md`.

### Mandatory behavior

- Build responsive layouts from mobile to wide desktop.
- Use semantic HTML before ARIA.
- Support keyboard navigation and visible focus.
- Provide loading, empty, error, success, disabled, and permission-denied states.
- Preserve filters and pagination in URL query parameters for list pages.
- Use server-rendered public article and issue pages for discoverability.
- Never rely on color alone to communicate status.
- Avoid decorative gradients, glassmorphism, excessive rounded cards, random blobs, or generic AI-dashboard composition.
- Use meaningful scholarly sample content, not lorem ipsum.
- Show irreversible-action confirmation with consequences.
- Warn users about unsaved multi-step submission changes.

### Component rule

Use shared primitives from `packages/ui`. Do not paste generated component code into multiple apps.

`shadcn/ui` or Radix primitives may be used as implementation foundations, but final components must be restyled to the project's own tokens and must not look like an unchanged starter template.

---

## 13. Background Jobs and External Integrations

Use the queue for slow, retryable, or external work:

- transactional email;
- antivirus scanning;
- document metadata extraction;
- search indexing;
- PDF derivative generation;
- exports;
- Crossref deposits;
- ORCID synchronization;
- scheduled publication;
- webhook delivery.

Every job must define:

- idempotency behavior;
- retry policy;
- timeout;
- dead-letter or failed state;
- structured logs;
- user-visible status when relevant.

External integrations must be behind adapters. Core workflow must remain testable without network access.

Do not block a web request while waiting for a third-party indexing, DOI, email, or file-processing response.

---

## 14. Test Strategy

Every material feature needs tests at the lowest useful level plus one integration path.

### Unit tests

Cover:

- workflow transition rules;
- permission policies;
- reviewer anonymity rules;
- metadata validation;
- date and scheduling rules;
- pure transformation utilities.

### Integration tests

Cover:

- API plus database behavior;
- authorization failures;
- transactions and audit records;
- upload authorization and visibility;
- queue producer behavior;
- public publication queries.

### End-to-end tests

At minimum, maintain these critical journeys:

1. Author registers, verifies email, creates a submission, uploads files, and submits.
2. Editor screens the submission and assigns an editor or reviewer.
3. Reviewer accepts, submits a recommendation, and cannot access forbidden identities.
4. Editor requests revision and author resubmits a new version.
5. Editor accepts, production prepares the article, and publication is scheduled.
6. Reader discovers and opens a published article and downloads a public galley.
7. Unauthorized users cannot access private manuscripts or reviews.

### Accessibility tests

Use automated checks plus keyboard smoke testing for critical pages. Automated tests do not replace manual review.

---

## 15. Standard Validation Commands

Use repository scripts as the canonical interface. The root `package.json` should provide:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

For database-related changes also run:

```bash
pnpm db:validate
pnpm db:migrate:test
```

For UI-heavy changes also run:

```bash
pnpm test:a11y
pnpm test:visual
```

If a command cannot run because infrastructure or credentials are unavailable, do not claim it passed. Run the remaining checks and report the exact limitation.

Do not disable, skip, weaken, or delete a failing test merely to make a gate pass. If a pre-existing failure is unrelated to the task, preserve evidence of the failure and distinguish it from regressions introduced by the task.

### Dependency review

Before adding a dependency, verify that:

- the need is current and cannot reasonably be met by the existing stack;
- the project is actively maintained and has an acceptable license and security reputation;
- bundle, runtime, build, and operational impact are proportionate;
- it does not introduce a second competing solution for an established concern.

Do not add a package for trivial utility code.

---

## 16. CI and CD Gates

A pull request is not merge-ready unless:

- formatting, lint, and type checks pass;
- unit and integration tests pass;
- affected E2E tests pass;
- production build succeeds;
- migration validation succeeds when schema changes;
- dependency and container scans have no unreviewed critical issue;
- secret scanning passes;
- API compatibility is reviewed when contracts change;
- screenshots or visual tests are attached for material UI changes;
- relevant documentation is synchronized.

Production deployment must use immutable artifacts and run migrations as a controlled release step.

Never auto-deploy a failed or partially tested build.

---

## 17. Definition of Done

A task is complete only when all applicable conditions are true:

- behavior matches `PRD.md`;
- visual result matches `DESIGN.md`;
- authorization is enforced server-side;
- input and failure states are handled;
- database integrity is preserved;
- audit logging is added where required;
- relevant tests pass;
- public pages remain SEO-friendly;
- accessibility is not regressed;
- no dead UI or placeholder action remains;
- environment or migration changes are documented;
- PRD/DESIGN changelog is updated only when necessary;
- the PRD implementation progress tracker reflects the verified result of the task;
- final summary is accurate and does not overclaim.

### Mandatory pre-completion security review

Before reporting completion, explicitly check the affected path for:

- unintended cross-role or cross-journal data exposure;
- missing server-side authorization or resource ownership validation;
- private file visibility and storage-path leakage;
- secrets, tokens, passwords, confidential content, or PII in logs and responses;
- privilege broadening, unsafe defaults, or workflow bypasses;
- missing audit events for privileged or security-sensitive actions.

---

## 18. Completion Report Template

Use this compact structure:

```text
Implemented
- ...

Validated
- `pnpm ...` — passed/failed/not run and why

Operational notes
- Migration: ...
- Environment: ...
- Documentation: ...

Remaining risk
- None, or one concise real limitation

Next recommended step
- One concrete next action from the earliest incomplete MVP dependency
```

### Autonomous next-step rule

- Do not ask the user to choose a next step when the MVP delivery order and current progress expose one safe, unambiguous dependency.
- Complete all safe work within the user's stated goal before returning.
- End every implementation report with exactly one best recommended next step.
- A recommendation does not authorize destructive actions, production deployment, external communication, paid services, credentials, or a new product decision.
- When the user explicitly asks to continue automatically toward a broad project goal, proceed through the documented delivery order until complete or genuinely blocked, validating and updating PRD progress after each vertical slice.

### Continuous MVP execution rule

The standing repository objective is to advance the verified MVP delivery order in `PRD.md`. Once the user has authorized continued project work, do not stop merely because one vertical slice finished or because a next recommendation exists.

After each slice:

1. run its applicable validation gates;
2. update the PRD implementation tracker, date, and changelog;
3. select the earliest safe incomplete dependency;
4. begin that dependency immediately in the same working session.

Continue until one of these terminal conditions is true:

- every MVP launch-readiness criterion in `PRD.md` is implemented and its applicable gates pass;
- a genuine blocker under Section 3 requires a credential, external service, destructive decision, legal/product-owner decision, or unavailable infrastructure;
- the user explicitly pauses, redirects, or ends the work;
- a system/tool limit prevents further verified progress.

Do not treat a suggested next step, context compaction, long runtime, or a partially complete phase as a reason to wait for another prompt. Preserve scope and safety: this standing authorization covers reversible local implementation, tests, migrations, and documentation only; it never authorizes production deployment, paid services, external communication, secret creation for third parties, destructive data operations, or unilateral product decisions.

---

## 19. Hard Prohibitions

Do not:

- claim the platform itself is Scopus, SINTA, Crossref, DOAJ, or OJS;
- copy those platforms' branding or protected visual identity;
- show fake accreditation, citation, quartile, impact-factor, or indexing badges;
- allow AI to autonomously accept or reject manuscripts;
- expose reviewer identity in a blind workflow;
- overwrite published history without trace;
- bypass authorization for convenience;
- use production secrets in local fixtures;
- merge a schema change without a migration;
- ship generic generated UI without applying `DESIGN.md`;
- add a new dependency when the existing stack already solves the problem well;
- rewrite unrelated files during a focused task.
- delete data merely to make tests pass;
- disable or weaken tests instead of fixing the underlying behavior;
- remove authorization to resolve access errors;
- add hidden `admin=true`, role, or tenant-bypass shortcuts;
- silently broaden permissions or change data ownership;
- expose private object-storage resources publicly;
- change the approved architecture solely for agent preference.

---

## 20. Document Control

- **Status:** Active
- **Owner:** Project maintainers
- **Last updated:** 2026-08-15

### Changelog

- **2026-08-15:** Added a standing continuous-MVP rule so agents automatically execute the earliest safe incomplete dependency after every verified slice until launch readiness or a genuine blocker.

- **2026-08-15:** Merged applicable operational guidance from the external agent specification: conservative decision defaults, coding and dependency discipline, one identity system, structured CMS boundaries, pre-completion security review, documentation ownership, and stronger change-safety prohibitions.

- **2026-08-03:** Required verified PRD progress updates and one autonomous next-step recommendation after every material implementation task.

- **2026-08-03:** Initial execution protocol, source-of-truth hierarchy, token discipline, architecture guardrails, quality gates, and documentation synchronization rules.
