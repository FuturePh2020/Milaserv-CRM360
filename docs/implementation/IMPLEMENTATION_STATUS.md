# Implementation Status

Last updated: 2026-07-23, end of Phase 2 (Phases 0/1 done in an earlier pass
this same session).

This file exists so nobody has to guess what's real. If something isn't
listed as done-and-verified below, assume it does not work yet.

## Phase 0 — Repo scaffold, architecture docs, monorepo config

**Status: Done.**

- pnpm workspace with `apps/{web,api,worker,activity-agent}` and
  `packages/{database,contracts,validation,ui,config}`.
- Full Prisma schema for every model in the specification (users/RBAC,
  sessions/breaks/attendance, import framework, leads/medication
  items/assignments/dispositions/follow-ups/order references/status
  history/notes, household groups, CDR staging/records/matches, audit log,
  system settings). **Validated**: `prisma validate` passes; migration
  `20260723170836_init` generated and applied against a real local Postgres
  16 instance; Prisma Client generates cleanly.
- `docker-compose.yml`, `.env.example`, root `package.json`/`pnpm-workspace.yaml`.
- Architecture/data-model/security docs (this directory's siblings).
- Docker Compose itself could **not** be verified end-to-end in this sandbox
  (outbound registry pulls are blocked by the environment's network policy).
  Verified equivalently instead: a local `postgresql-16` + `redis-server`
  install, against which migrations, seed, and the API were run directly.
  Re-verify `docker compose up` in an environment with registry access before
  relying on it for staging.

## Phase 1 — Auth, RBAC, users, teams, shifts

**Status: Core auth is done and live-verified. Users/Teams/Shifts CRUD is
implemented but not yet covered by automated tests.**

Done and verified live against a running Postgres instance in this session:

- Login, JWT access token (15 min) + rotating hashed refresh token
  (httpOnly cookie), logout (revokes refresh token), refresh (rotates,
  rejects reused/revoked tokens).
- Account lockout after N failed attempts (unit-tested,
  `auth.service.spec.ts`, 5/5 passing).
- Global `JwtAuthGuard` + `RolesGuard`; confirmed live that an `AGENT` gets
  `403` on `GET /users` and a `TEAM_LEADER` succeeds.
- Rate limiting on `/auth/login` confirmed live (429 after the configured
  limit).
- Seed script creates the initial Team Leader from env vars (idempotent
  upsert) — run and verified.
- Audit log entries written for login success/failure/lockout, password
  change, user/team/shift creation and updates.

Implemented but **not yet unit/integration tested** (manual curl testing
only, or none):

- `UsersService`/`UsersController`: CRUD, lead-permission grant/revoke.
- `TeamsService`/`TeamsController`: create/list/get with Shift-Supervisor
  scoping.
- `ShiftsService`/`ShiftsController`: create shift, set weekly schedule.

Not yet built:

- Password reset flow (architecture note only — no endpoint yet).
- MFA (explicitly deferred per spec, design-compatible).
- `TeamScopeGuard` exists but is not wired into any controller yet — team
  scoping today is enforced by service-layer filtering only, which is
  correct but the route-param-based guard is unused dead code until a
  controller needs it (flagging so it isn't mistaken for "already applied
  everywhere").
- Web app has a login page only (`apps/web/src/app/login`); no authenticated
  dashboard shell yet.

## Phase 2 — Database and import framework

**Status: Done for the generic (source-type-agnostic) framework, live-verified
end-to-end against the real sample files. Per-type grouping/normalization
(Cash/Insurance semantics, CDR staging) is explicitly Phase 3/9, not this
phase.**

Done and verified live against a running Postgres + Redis instance in this
session, using the actual files in `docs/samples/`:

- `packages/validation`: `parseSpreadsheet` (shared XLSX/XLS/CSV reader via
  SheetJS) and `findMissingRequiredColumns`/`findEmptyRequiredFields`
  (structural validation against the required-column lists from the Data
  Mapping workbook). 28 unit tests passing.
- **Real bug caught and fixed during live testing**: SheetJS's
  `sheet_to_json` silently drops fully-blank rows by default, which desyncs
  an index-based "source row number" from the true spreadsheet row the
  moment a file has a blank row before the end (confirmed against
  `cash_leads.xlsx`, which has six trailing blank rows before a final
  stray-value row). Fixed with the `blankrows: true` option and locked in
  with a regression test (`sheet.test.ts`) asserting the exact row count and
  the last row's content match the raw file. Without this fix, error reports
  would have pointed a Team Leader at the wrong Excel row.
- `apps/api/src/imports`: upload endpoint (mime/size validation, SHA-256
  checksum, disk storage, prior-upload detection), batch creation, preview
  generation (parses the file, persists `LeadImportRow`/`LeadImportError`,
  detects in-file duplicate rows via content hash, computes
  total/valid/invalid/duplicate counts), confirm (enqueues a BullMQ job),
  batch/error listing, and CSV error export.
- `apps/worker`: real `lead-import` queue consumer
  (`apps/worker/src/imports/process-batch.ts`) that transitions
  `QUEUED → PROCESSING → COMPLETED`/`COMPLETED_WITH_ERRORS` and is
  idempotent against redelivery of an already-finished job.
- **Live end-to-end run, this session**: uploaded the real `cash_leads.xlsx`
  → created a CASH batch → generated a preview (28 rows detected, matching
  the file's true `A1:L29` range minus the header; row 2 correctly flagged
  as the merged title-banner row; rows 23–28 correctly flagged as duplicate
  blank rows; row 29 correctly flagged as the stray `"Column1"` artifact
  row) → confirmed → worker picked up the BullMQ job → batch reached
  `COMPLETED_WITH_ERRORS` → CSV error export downloaded and inspected. Also
  ran the real `med_gulf_sample.xlsx` through the INSURANCE path (18/18 rows
  valid, no missing columns). Re-uploading the identical `cash_leads.xlsx`
  file was correctly flagged `alreadyUploadedBefore: true`.
- `ImportsService` unit tests (`imports.service.spec.ts`, 6 passing) cover
  upload/create authorization (Team-Leader-only) and status-guard rejections
  (preview before upload complete, confirm before preview).

Explicitly not this phase (tracked for Phase 3/9):

- No `Lead`/`LeadMedicationItem`/`Person` rows are created yet — grouping by
  business key (phone+date+branch for Cash, NATIONALID+claim_seq_id for
  Insurance) is Phase 3.
- No CDR-specific staging/matching — Phase 9 owns `CdrStagingRecord`/
  `CdrRecord` population and the large-file performance path.
- "Already imported in a previous batch" is only detected at the
  whole-file-checksum level right now; row/business-key-level idempotency
  (e.g. the same lead re-appearing in a different file) is a Phase 3
  concern once the grouping key exists.
- Column mapping is currently fixed to the literal header names from the
  Data Mapping workbook (`REQUIRED_COLUMNS_BY_SOURCE_TYPE`); the
  `ImportColumnMapping` model exists in the schema but there's no UI/endpoint
  yet to define a custom mapping.

## Phases 3–12

**Not started.** Cash/Insurance parsers (grouping, normalization, Lead
creation), sessions/breaks, activity companion wiring end-to-end, lead
distribution, dispositions, search/Take Lead, CDR matching, dashboards,
branding polish, and the release checklist are all outstanding.

The .NET activity companion (`apps/activity-agent`) has idle-detection,
device-registration, and heartbeat-loop source code, but **has not been
compiled or run** — there is no .NET SDK or Windows environment in this
sandbox. Treat it as unverified until built on Windows.

## Quality gates, as of this update

```
pnpm --filter @milaserv/validation test    # 28/28 passing
pnpm --filter @milaserv/api test           # 11/11 passing (auth + imports)
cd packages/database && prisma validate    # valid
cd apps/api && tsc --noEmit                # clean
cd apps/worker && tsc --noEmit             # clean
cd apps/web && tsc --noEmit                # clean
cd apps/api && nest build                  # clean
cd apps/worker && tsc -p tsconfig.json     # clean
```

`pnpm lint` across every package and a full `docker compose build` have not
been run yet in this session — the latter is expected to fail in this
sandbox specifically (no container-registry access, see Phase 0 notes), not
necessarily elsewhere.
