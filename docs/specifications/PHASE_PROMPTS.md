# Milaserv CRM360 — Claude Code Phase Prompts

Use these only if Claude Code stops or you prefer one phase at a time.

## Phase 0 — Architecture and repository creation

Read:
- docs/specifications/MILASERV_CRM360_MVP.md
- docs/mapping/Milaserv_CRM360_Data_Mapping_MVP.xlsx
- all samples
- logo

Create the complete monorepo structure, architecture docs, implementation plan, environment files, Docker setup and package configuration. Do not stop at planning. Continue into Phase 1 after the plan is written.

## Phase 1 — Auth, RBAC, users, teams, shifts

Implement secure authentication, refresh tokens, role guards, scope guards, users, teams, shifts, schedules, lead permissions, admin management screens, audit logs, tests and seed data.

## Phase 2 — Database and import framework

Implement complete Prisma schema, migrations, partial unique indexes, import tables, BullMQ worker, upload security, preview, progress, error files and idempotency.

## Phase 3 — Cash and Insurance imports

Implement full Cash and Insurance parsers from the supplied samples, grouping, normalization, price parsing, date format selection, long-text identifiers, medication child items, validation and tests.

## Phase 4 — Sessions, manual breaks, attendance

Implement Agent sessions, manual breaks, daily/monthly reporting, attendance statuses, Egypt timezone and Admin monitoring.

## Phase 5 — Windows activity companion and idle breaks

Implement device registration, secure token issuance, heartbeat verification, Windows last-input companion, automatic idle break transitions and tests. Do not record key contents or screenshots.

## Phase 6 — Atomic lead distribution

Implement Cash/Insurance pools, permissions, deterministic Generate Lead, atomic locks, one active lead per Agent, assignment history and concurrency tests.

## Phase 7 — Call Customer and dispositions

Implement Call Customer, call attempt placeholders, exact dispositions, external order number, refill calculation, reschedule ownership, wrong number and final states.

## Phase 8 — Search and Take Lead

Implement phone/identity search, masking, no medication leakage, household grouping, atomic Take Lead and No Answer/Busy callback eligibility.

## Phase 9 — Yeastar CDR

Implement upload, staging, timezone setting, direction-aware matching, IVR/Queue exclusion, idempotency, match confidence, end-of-day reports and large-file tests.

## Phase 10 — Dashboards and reports

Implement Admin and Agent dashboards, separate Cash/Insurance counters, performance, sessions, breaks, converted leads, CDR mismatches, filters, exports, WebSocket/SSE and 15-second fallback.

## Phase 11 — Branding and UX

Apply Milaserv logo and exact palette, compact professional UI, accessible states, responsive behavior and no large empty spaces.

## Phase 12 — Security, performance and release

Run security review, load tests, concurrency tests, import tests, CDR tests, query/index review, Docker build, production build, staging deployment docs, UAT, rollback, operations runbook and one-month pilot plan.

Do not start Phase 2 Order Management.
