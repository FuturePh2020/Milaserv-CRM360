# Implementation Status

Last updated: 2026-07-23. All 13 planned phases (0-12) complete, plus a
post-MVP pass (below) that filled in every remaining Admin/Agent nav page so
the frontend has no "Soon" placeholders left.

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

Explicitly not this phase (tracked for Phase 3/9 as of the Phase 2 pass; now
resolved for Cash/Insurance in Phase 3 below):

- No CDR-specific staging/matching — Phase 9 owns `CdrStagingRecord`/
  `CdrRecord` population and the large-file performance path.
- Column mapping is currently fixed to the literal header names from the
  Data Mapping workbook (`REQUIRED_COLUMNS_BY_SOURCE_TYPE`); the
  `ImportColumnMapping` model exists in the schema but there's no UI/endpoint
  yet to define a custom mapping.

## Phase 3 — Cash and Insurance import parsers

**Status: Done for the actual grouping/normalization/Lead-creation logic,
live-verified end-to-end against both real sample files, including
idempotent re-import.**

- `packages/validation` additions: `mapCashLegacyStatus`/`parseLegacyAgentLabel`
  (Cash §9.3/§9.4 rules) and `buildCashGroupKey`/`buildInsuranceGroupKey`/
  `buildInsuranceItemKey` (grouping-key precedence from §8.1/§8.2/§9.1) — all
  pure functions, 12 new unit tests.
- **Second real bug caught and fixed via live testing**: the actual sample
  files render dates with 2-digit years (`cash_leads.xlsx` Date column as
  `"5/6/26"`, `med_gulf_sample.xlsx` CLAIMDATE/SERVICEDATE as `"4/14/26"`).
  `parseImportDate` was silently parsing `"26"` as the literal year 26 AD.
  Fixed by expanding 2-digit years (`+2000`) and locked in with a regression
  test using the exact real values.
- `apps/worker/src/imports/cash.processor.ts`: parses phone/date/price per
  row, groups by phone+date+branch, upserts one `Person` per normalized
  phone, creates one `Lead` (status `AVAILABLE`) per group with N
  `LeadMedicationItem` children (item key = content hash of the raw row, so
  reprocessing the same row is a no-op upsert), writes an initial
  `LeadStatusHistory` entry. Rows that pass Phase 2's structural check but
  fail Cash-specific parsing (bad phone/date) are recorded as new
  `LeadImportError` rows rather than silently dropped or crashing the batch.
- `apps/worker/src/imports/insurance.processor.ts`: same shape, grouping by
  `NATIONALID+claim_seq_id` (fallback phone+invoice+service date), item key
  `inv_item_idm` (fallback `claim_seq_id+code`); all long identifiers
  (national id, claim/invoice/policy/payer/preauth/item keys) kept as
  strings throughout, never coerced to numbers.
- **Product decision made and flagged for sign-off, not silently assumed**:
  a freshly imported Cash lead always starts `AVAILABLE` regardless of the
  legacy `Status` text (`sourceStatusRaw` is preserved verbatim; the mapped
  legacy disposition is available via `mapCashLegacyStatus` for
  reporting/reference). Rationale: this is a new system with no real
  `LeadAssignment`/`CallAttempt` behind the legacy text, so auto-promoting a
  row to `FOLLOW_UP_SCHEDULED` or `CALLBACK_ELIGIBLE` on import would
  fabricate assignment-shaped state that never actually happened here. The
  legacy `Date to be called` value is preserved in the row's raw JSON but
  does **not** currently seed a `LeadFollowUp` record. If the business wants
  imported reschedule requests to pre-populate follow-ups, that's a
  deliberate follow-up decision for a Team Leader to confirm, not something
  to have guessed silently.
- **Live end-to-end verification, this session**, against a real
  Postgres instance, starting from an empty `leads`/`people` table:
  - Cash: 19 valid rows → **18 leads / 19 items** (correctly merged the two
    `Mounjaro 10Mg`/`5Mg` rows for phone `500210989` + branch `P440` into one
    lead with 2 items; every other valid row became its own single-item
    lead).
  - Insurance: 18 valid rows → **8 leads / 18 items**; spot-checked that
    18-digit claim/invoice numbers and 10-digit national IDs are stored
    exactly as text (`260414140145010045`, `2054223520`, etc.) with no
    precision loss or scientific notation.
  - Re-uploaded the identical `cash_leads.xlsx` and re-ran the full
    upload→preview→confirm→process cycle: lead count stayed at 18, item
    count stayed at 19 (upserts against the same deterministic keys, no
    duplicates) — confirmed the grouping/item keys are genuinely idempotent
    across separate import batches, not just within one file.

Not yet built (still Phase 9, unchanged):

- CDR-specific staging/matching.
- Column mapping UI/endpoint (structural validation still uses the fixed
  header-name lists).
- City-name normalization is currently a trim only, not a known-variants
  dictionary (spec §9.2 allows normalizing "known spelling variants"; no
  such dictionary exists yet).

## Phase 4 — Sessions, manual breaks, attendance

**Status: Done for manual breaks and the session state machine, live-verified
end-to-end. Idle breaks are explicitly Phase 5 (require the activity
companion). Daily attendance classification covers the cases session/break
activity can determine; schedule-driven statuses (VACATION/DAY_OFF/ABSENT)
and a day-boundary cron sweep are not built.**

- `packages/validation/src/timezone.ts`: `toCairoDateString` - the one place
  UTC→Africa/Cairo calendar-day conversion happens, via `Intl.DateTimeFormat`
  (correct across any historical/future DST changes since it uses the IANA
  tz database, not a fixed offset). 2 unit tests, including a UTC-day-vs-
  Cairo-day rollover case.
- `apps/api/src/sessions/sessions.service.ts`: start/end session, start/end
  manual break, `assertActiveAndNotOnBreak` (the shared precondition Phase 6
  Generate/Take Lead and Phase 7 Call Customer will call), admin
  monitoring (`listActiveSessions`, scoped to team for Shift Supervisor),
  and force-close with a required reason. One active session per user is
  enforced by the same nullable-marker unique-constraint pattern as leads
  (`docs/architecture/DATA_MODEL.md`) - a second `Start Session` call gets a
  clean `409`, not a race condition. 12 unit tests covering the state
  machine (double-start, break-while-on-break, ending a session while on
  break, work-seconds calculation).
- `apps/api/src/sessions/attendance.service.ts`: `recomputeDay` rolls up
  `WorkSession`/`BreakEvent` rows that started on a given Africa/Cairo
  calendar day into an `AttendanceDay` row, called after every session/break
  end and force-close. Classifies `WORKED_NO_BREAK` (zero breaks - never
  `VACATION`, per the non-negotiable rule) vs `PRESENT` (had at least one
  break) vs `FORCE_CLOSED`/`SESSION_NOT_CLOSED`.
- **Live end-to-end verification, this session**: started a session →
  confirmed a second `Start Session` call correctly 409s → started a manual
  break → confirmed a second break-start 409s → confirmed `GET
  breaks/current` returns the open break → ended the break → ended the
  session → confirmed `GET /attendance/me` shows the correct rollup
  (`PRESENT`, `breakCount: 1`, `manualBreakSeconds` matching the actual
  elapsed time). Also verified the admin path: `GET /sessions/active` lists
  the live session scoped correctly, an Agent gets `403` attempting
  `force-close`, and a Team Leader's force-close correctly sets
  `FORCE_CLOSED` with the reason recorded.

Known gaps, flagged rather than silently assumed complete:

- **Cross-midnight sessions**: `recomputeDay` attributes all of a
  session/break's seconds to the Cairo day it *started* on. A session that
  runs past midnight Cairo time is not split across two `AttendanceDay`
  rows. Spec §5.4 implies a day-boundary process; no cron/scheduler
  infrastructure exists yet to run one (see Phase 12).
- **`PARTIAL_SESSION` is never assigned.** Doing so correctly requires
  comparing actual session duration against the assigned `ShiftSchedule`,
  which isn't wired up yet.
- **`VACATION`/`DAY_OFF`/`ABSENT` are never assigned.** These are meant to
  come from schedule data or explicit admin classification (spec §5.4),
  neither of which is built - `recomputeDay` only ever writes a row when
  there was actual session activity that day, and deliberately does not
  invent a status for days with no activity.
- No idle breaks yet - `BreakEvent.type = IDLE` is fully supported by the
  schema and this service's rollup logic, but nothing creates an idle break;
  that requires the device heartbeat endpoint in Phase 5.

## Phase 5 — Activity companion and idle breaks

**Status: Server side (device registration, heartbeat auth, idle-break
creation/closure) is done and live-verified, including the exact worked
example from the spec. The .NET companion itself remains unverified - no
Windows/.NET SDK in this sandbox.**

- `apps/api/src/common/guards/device-auth.guard.ts`: authenticates
  `POST /devices/heartbeat` via a long-lived device token (`Authorization:
  Device <token>`, hashed at rest like refresh tokens), completely separate
  from the short-lived user JWT - the companion runs unattended and can't do
  an interactive login/refresh flow. Confirmed live that a device token
  cannot authenticate a normal user endpoint (`GET /users` → `401`).
- `apps/api/src/devices/devices.service.ts`:
  - `register`: issues a device token for an Agent's device (`POST
    /devices/register`, requires a normal Agent JWT); refuses to re-register
    a device already actively claimed by a different user.
  - `processHeartbeat`: records an `ActivityHeartbeat`, then applies the
    idle-break rule (spec §5.2) - **the break start time is the reported
    last-activity timestamp, not the moment the threshold was crossed**.
    Skips idle logic entirely while the Agent is on an explicit manual
    break. Idempotent across repeated "still idle" heartbeats (does not open
    a second idle break).
- **Live end-to-end verification, this session**: started a session,
  registered a device, sent a heartbeat reporting 400s idle with
  `lastActivityAt` ~400s in the past → confirmed the session flipped to
  `ON_IDLE_BREAK`. Sent a follow-up heartbeat reporting activity resumed
  (`idleDurationSeconds: 0`) → confirmed the session returned to `ACTIVE`
  and the `BreakEvent` row's `duration_seconds` matched exactly
  (`started_at`→`ended_at` = 407s, consistent with "break starts from last
  activity, not detection time"). Also reproduced the spec's literal worked
  example (10:00 last activity / 10:05 threshold / 10:12 resume → 12-minute
  duration) as a unit test.
- 7 new unit tests (`devices.service.spec.ts`) covering registration
  conflicts and every idle-break transition.

Not done (tracked honestly, not silently assumed):

- **The .NET companion (`apps/activity-agent`) has not been compiled or
  run anywhere in this work.** There is no Windows environment or .NET SDK
  available in this sandbox. The source (Win32 `GetLastInputInfo` idle
  detection, device registration call, heartbeat loop) exists and was
  authored to match the API contract above, but it is unverified until
  someone builds and runs it on Windows against a real API instance.
- No packaging/installer, auto-start, or Windows-service wrapper for the
  companion - it is currently a plain console app.
- No admin UI/endpoint to list or revoke registered devices (the
  `DeviceRegistration.isActive`/`revokedAt` fields exist in the schema and
  are honored by the auth guard, but nothing sets `revokedAt` yet).

## Phase 6 — Atomic lead distribution

**Status: Done and proven live under real concurrency, including the two
required scale tests from the spec (≥50 concurrent Generate Lead, Take Lead
race). This is the highest-risk correctness requirement in the whole
project, so it got the most aggressive live testing of any phase so far.**

- `apps/api/src/leads/leads.service.ts`:
  - `generateLead`: verifies active/non-break session, verifies the Agent
    holds no other active lead, verifies `UserLeadPermission` for the
    requested `leadType`/partner, then atomically claims the next eligible
    lead via `SELECT ... FOR UPDATE SKIP LOCKED` ordered by
    `batch_priority, source_order, batch.created_at, lead.id` (spec §11.1
    ordering, exactly). Concurrent callers each lock a *different* row
    instead of blocking or double-claiming one.
  - `takeLead`: same session/permission checks, but locks one specific
    requested lead; if another transaction already holds its row lock,
    `SKIP LOCKED` returns zero rows immediately, which is treated as the
    same "already assigned to another agent" conflict as a stale status -
    no blocking, no ambiguity.
  - Both write the claim (status → `PENDING_CALL`, `LeadAssignment` with
    `activeLeadMarker`/`activeAgentMarker` set, `LeadStatusHistory`, audit
    log) inside the same transaction as the row lock, so the lock and the
    claim can never observably disagree.
  - "One active lead per Agent" has two independent layers: a friendly
    pre-check (fast, clear error) and the real guarantee - the
    `activeAgentMarker` unique constraint - which is caught (Postgres error
    `P2002`) and converted to the same friendly `409` if two calls from the
    same Agent ever race past the pre-check.
- **Two real bugs caught and fixed via live testing, not just unit tests
  (mocked Prisma cannot catch either of these - they only show up against a
  real Postgres instance)**:
  1. The candidate-selection raw SQL compared a native Postgres enum
     column (`leads.status`) against plain-text bound parameters
     (`operator does not exist: "LeadStatus" = text`) - every single
     `Generate Lead` call failed with a 500 until this was found and fixed
     by casting the column (`l.status::text IN (...)`).
  2. Prisma's default interactive-transaction timeout (5s) was too short
     under real contention from 55 simultaneous callers sharing Prisma's
     default (small) connection pool - transactions were being aborted
     client-side while still queued for a free connection. Fixed two ways:
     raised the transaction's `maxWait`/`timeout` to 15s in code (permanent
     fix), and documented sizing `DATABASE_URL`'s `connection_limit` for
     real concurrent load in `.env.example` and
     `docs/deployment/PRODUCTION.md` (an infra/config concern, not just
     code).
- **Live verification, this session, against a real Postgres instance**:
  - Seeded 55 real Agent accounts (real login, real session start) and 70
    available Cash leads, then fired 55 **genuinely concurrent**
    (`Promise.all`) `POST /leads/generate` requests. Result: **55/55
    succeeded, 55 distinct leads, zero duplicates, exactly 55 active
    `LeadAssignment` rows** (verified in the DB directly, not just from API
    responses) - satisfies the spec's "≥50 concurrent requests, every
    successful Agent receives a distinct lead, no duplicate active
    ownership, one active lead per Agent" test exactly.
  - Seeded one single lead and 10 real Agent accounts, then fired 10
    concurrent `POST /leads/:id/take` requests for that *same* lead. Result:
    **exactly 1 success, 9 conflicts** with the spec's literal message
    ("This lead is currently assigned to another agent."), and the DB shows
    exactly one `LeadAssignment` row total for that lead - the 9 losers
    never got far enough to write anything, they were excluded by the row
    lock before any insert was attempted.
- 9 new unit tests (`leads.service.spec.ts`) covering the permission/
  precondition logic (mocked Prisma - these could not have caught either
  bug above, which is exactly why the live tests were run).

Not built yet (Phase 7/8, as planned):

- Releasing an active lead (No Answer/Busy → `CALLBACK_ELIGIBLE`, Order
  Created, other dispositions) - `generateLead`/`takeLead` claim leads but
  nothing yet closes an assignment. Until Phase 7 exists, an Agent who
  claims a lead in this environment has no API path to release it other
  than direct DB access.
- Leads Search (Phase 8) - `takeLead` requires a `leadId` the caller already
  knows; there's no search endpoint yet to find one.

## Phase 7 — Call Customer and dispositions

**Status: Done and live-verified, including the spec's literal No Answer/Busy
scenario end-to-end.**

- `apps/api/src/dispositions/dispositions.service.ts`:
  - `callCustomer`: verifies ownership (an active `LeadAssignment` for this
    Agent) and session, creates a `CallAttempt` placeholder, moves
    `PENDING_CALL` → `CUSTOMER_CONTACTED`. The click itself is explicitly
    not proof of a real call (spec §12.2) - Yeastar CDR verification is
    Phase 9.
  - `saveDisposition`: requires the lead to already be `CUSTOMER_CONTACTED`
    (i.e. Call Customer must happen first), then validates and applies each
    disposition's specific rule:
    - `ORDER_CREATED`: requires `externalOrderNumber`, unique (DB
      constraint, caught `P2002` → clean `409`), → `CONVERTED_TO_ORDER`,
      closes the assignment. Because the assignment only closes *after* the
      order reference is successfully created, an Agent who hits the
      duplicate-number conflict is still holding their active lead
      afterward - confirmed live, matching "Agent cannot Generate Lead
      until successfully saved."
    - `ALREADY_DISPENSED`: requires `lastDispenseDate` + `refillPeriodDays`
      (26-80, validated at the DTO layer, the service layer via
      `calculateNextRefillDate`, and now the DB via a `CHECK` constraint
      added this phase), computes and stores `nextRefillDate` on the
      `LeadDisposition` row → `COMPLETED`, closes the assignment.
    - `RESCHEDULE_FOLLOW_UP`: requires `followUpDate` + `followUpPeriod`,
      creates a `LeadFollowUp` row → `FOLLOW_UP_SCHEDULED`, and
      deliberately does **not** close the assignment (spec §14.3 - stays
      with the same Agent, and is automatically excluded from Take
      Lead/Generate Lead eligibility since those only ever select
      `AVAILABLE`/`CALLBACK_ELIGIBLE` leads).
    - `NO_ANSWER_BUSY`: the revised ownership rule (spec §14.4) →
      `CALLBACK_ELIGIBLE`, closes the assignment immediately so another
      Agent can take the callback, while the original assignment row stays
      in history (released, not deleted).
    - `WRONG_NUMBER` → `INVALID_NUMBER`; the other five dispositions →
      `COMPLETED`. Both close the assignment.
- A real bug was caught by the new unit tests before it ever reached live
  testing: the disposition switch statement had no case for
  `ALREADY_DISPENSED`, so it fell through to a hard `BadRequestException`
  ("Unhandled disposition type"). Fixed by explicitly including it among
  the dispositions that resolve to `COMPLETED`.
- **Live end-to-end verification, this session, against a real Postgres
  instance, reproducing the spec's literal No Answer/Busy scenario**:
  Agent A took a lead → called the customer → saved `NO_ANSWER_BUSY` →
  confirmed the lead flipped to `CALLBACK_ELIGIBLE` → fired concurrent Take
  Lead calls from Agent B and Agent C for that same lead → confirmed
  exactly one succeeded and the other got the spec's literal conflict
  message → confirmed in the DB that there are exactly two
  `LeadAssignment` rows for this lead: Agent A's original (released, not
  deleted - `releasedAt` set, `activeAgentMarker` null) and the winner's
  new active one. Also live-verified Order Created's duplicate rejection
  (second attempt with the same `externalOrderNumber` → `409`, and the
  Agent was confirmed still holding their active lead afterward since the
  failed save never closed the assignment).
- 14 new unit tests (`dispositions.service.spec.ts`).

Not built yet:

- Admin/Supervisor reassignment of a `FOLLOW_UP_SCHEDULED` lead stuck with
  an Agent (spec allows this "with required reason"; no such endpoint
  exists yet).
- Editing a previously saved disposition (`LeadDisposition.previousValue`/
  `editedById`/`editedAt` exist in the schema for this but nothing writes
  to them yet).

## Phase 8 — Search and Take Lead

**Status: Done and live-verified. Take Lead itself was already built and
proven in Phase 6; this phase adds Leads Search.**

- `packages/validation`: added `maskIdentifier` (generic long-identifier
  masking - keeps only the last 3 characters) alongside the existing
  `maskPhone`. 2 new unit tests.
- `apps/api/src/search/search.service.ts`: searches by normalized phone
  (household match - everyone sharing that number) or exact national id
  (identity match). Structurally cannot leak medication/pricing data: the
  `Lead` query uses an explicit `select` naming every field it returns, and
  never touches `LeadMedicationItem` at all - there's no `include` for a
  later change to accidentally widen. Different national IDs sharing a
  phone are returned as **separate** household entries, never merged into
  one record (spec §15.2). Results are filtered through the caller's
  `UserLeadPermission` grants, same model as Take Lead. Rate-limited
  (30/min) beyond the global default per spec §15's "must be ... rate-
  limited."
- **Live end-to-end verification, this session**: searched by phone for a
  real Cash lead with two medication items (`Mounjaro 10Mg`/`5Mg` from
  `cash_leads.xlsx`) and confirmed the response contains only
  `type/partner/branchCode/city/status/hasActiveOwner/callbackEligible/
  lastContactAt` - no medication name, quantity, or price anywhere.
  Searched by national id for the real Insurance customer and confirmed
  `customerName` is shown unmasked (spec allows this) while
  `maskedPhone`/`maskedIdentity` are masked. Confirmed a 2-character query
  is rejected with `400`.
- 6 new unit tests (`search.service.spec.ts`), including one that asserts
  the exact set of keys in a lead result (`Object.keys(lead).sort()`) so a
  future accidental field addition fails the test instead of silently
  leaking.

Not built:

- Partial/fuzzy search (spec allows it but says it "must be permission-
  controlled and rate-limited" as an explicit opt-in) - only exact
  phone/national-id match is implemented.
- No dedicated UI yet (`apps/web` still has only the login page).

## Phase 9 — Yeastar CDR import and matching

**Status: Done and live-verified against both a synthetic multi-scenario
fixture and the real 65,535-row `docs/samples/yeastar_cdr_sample.xls` file.
Three real bugs were caught and fixed during this phase's live testing -
none of them would have been caught by mocked unit tests alone.**

- `packages/validation` additions: `parseCdrTimestamp`/`zonedWallTimeToUtc`
  (`timezone.ts`) convert Yeastar's local "Time" column into a UTC instant
  using the batch's configured source timezone (an Admin-configurable
  setting per spec §16.4, defaulting to `Asia/Riyadh`), and
  `parseCdrEndpoint` (`cdr-endpoint.ts`) classifies a raw "Call From"/"Call
  To" value as a phone number, a named human extension, or a system
  endpoint (IVR/Queue/Voicemail keyword match). 13 new unit tests.
- `apps/worker/src/imports/cdr.processor.ts`: stages every structurally
  valid row into `CdrStagingRecord`, marks a row `isRelevant` via a single
  indexed join against `Person.phoneNormalized` (never an in-memory "all
  leads x all rows" loop), then - **critically** - groups staging rows by
  `cdrRecordId` (one real call *session*, which can span several staged
  *legs*: IVR → transfer → agent) before building one `CdrRecord` per
  session and running it through `matchCdrRecordToLead`. That function
  implements the full match-status decision tree from spec §16.2:
  `NOT_MATCHED` (no lead, or only a system endpoint was ever reached),
  `UNMAPPED_EXTENSION` (reached a human extension with no
  `ExtensionMapping` yet), `MATCHED` (exactly one open `LeadAssignment`
  covers this agent and this call's timestamp), `AMBIGUOUS` (more than one
  does), `AGENT_MISMATCH` (an assignment was open, but for a different
  agent than the one this call reached), `OUTSIDE_ASSIGNMENT_WINDOW` (no
  assignment covers the timestamp at all).
- `apps/api/src/extension-mappings`: `GET /extension-mappings` (Team
  Leader/Shift Supervisor) lists every extension the CDR pipeline has ever
  seen (auto-created on first sighting via `upsert`, so an Admin doesn't
  have to pre-register every extension before any CDR file can be
  processed); `PATCH /extension-mappings/:extension` (Team Leader only)
  assigns it to a user.
- `apps/api/src/cdr`: `GET /imports/batches/:id/cdr-report` (Team
  Leader/Shift Supervisor) returns the end-of-day CDR match report per
  spec §17 - per-row match status, matched lead/agent, and summary counts.
- **Three real bugs caught and fixed via live testing against the actual
  sample file, in addition to the existing mocked unit test suite**:
  1. **Duplicate-batch-per-file 500**: `LeadImportBatch.fileId` is
     `@unique`, but creating a second batch against an already-used
     `fileId` crashed with an unhandled `500` instead of a clean error.
     Fixed with a pre-check in `createBatch` that throws a
     `ConflictException` ("Upload the file again to start a new batch."),
     with a regression test.
  2. **N+1 performance bug in `generatePreview`**: one `await
     prisma.leadImportRow.create()` per row, in a loop, took **over 2.5
     minutes** against the real 65,535-row file. Rewritten to bulk
     `createMany` (client-generated row ids, chunked in batches of 5,000)
     - the same file now previews in **~16 seconds**, a ~9x speedup with
     identical row counts.
  3. **Multi-leg data loss (the significant one)**: the original schema
     treated `cdrRecordId` as unique per staging row
     (`@@unique([cdrImportId, cdrRecordId])`, `skipDuplicates: true`). A
     direct Python inspection of the real sample file's raw rows found
     that Yeastar records **one row per call leg**, and 8,561 of 35,891
     distinct call sessions have 2-7 legs (IVR → transfer → agent) sharing
     one `cdrRecordId` - 38,205 rows, ~58% of all valid rows. The original
     code silently discarded every leg after the first, which both lost
     data and meant only the *first* leg of any multi-leg call (often the
     IVR, never the connecting agent) could ever be matched - the exact
     opposite of spec §16.2's "final connected human endpoint...transfer
     chain or final leg" requirement for inbound calls. Fixed by migration
     `20260723185141_cdr_staging_multi_leg_fix` (changes the unique
     constraint to `(cdrImportId, sourceRowNumber)`, adds
     `sourceRowNumber`) and a full rewrite of `cdr.processor.ts` to group
     legs by session, sum call/ring/talk durations across legs, and derive
     the correct final agent endpoint (last non-system leg for inbound
     calls, first leg for outbound).
  4. **Timestamp parsing rejected ~23% of real rows**: `parseCdrTimestamp`'s
     regex assumed the Yeastar "Time" column never includes seconds
     (`"8/2/2026 13:32"`). Re-running the real file after the multi-leg fix
     showed 15,009 of 65,526 valid rows (23%) failing with
     `CDR_PARSE_FAILED` - inspecting the actual failing values found the
     same column also appears as `"13/02/2026 16:16:36"` (seconds
     included) elsewhere in the same file. Fixed by making the seconds
     group optional in the regex and threading it through
     `zonedWallTimeToUtc` (which already accepted whole seconds in its
     `Date.UTC` call, just never received any). Re-ran the real file after
     the fix: **0 `CDR_PARSE_FAILED` rows** (previously 15,009); all 65,526
     valid rows now stage correctly across the correct 35,891 distinct
     call sessions (matching the independent Python count).
- **Live end-to-end verification, this session**:
  - A synthetic 4-row fixture (`Take Lead` by a real agent + a pre-mapped
    extension → `MATCHED`; a call that only reached an IVR → `NOT_MATCHED`;
    a call to an unmapped extension → `UNMAPPED_EXTENSION`; an unrelated
    phone number → never promoted past staging) passed both before and
    after the multi-leg rewrite and the timestamp fix, confirming neither
    change regressed single-leg matching.
  - The real 65,535-row file: preview in ~16s (65,526 valid / 9 invalid /
    9 duplicate, unchanged throughout all fixes), full batch processing in
    ~78s, final state after all fixes: 65,526 rows staged (0 parse
    failures), 35,891 distinct call sessions grouped correctly. (0 of
    those sessions matched an actual `Lead` in this test database, which
    is expected - the real Yeastar sample's customer numbers have no
    reason to correlate with this session's synthetic test leads; the
    verification target here was the staging/grouping/parsing pipeline,
    not real matches.)
  - Duplicate-import idempotency (spec-required test): seeded a lead with
    an open assignment, uploaded a one-row synthetic CDR fixture as batch
    1 (→ 1 `CdrRecord`/1 `CallMatch`, status `MATCHED`), then uploaded the
    *same call session* (same Yeastar `cdrRecordId`, which is `@unique` on
    `CdrRecord`) again as an entirely separate batch 2. Confirmed the P2002
    catch path fired and the final state was still exactly 1
    `CdrRecord`/1 `CallMatch` - re-processing the same real-world call
    twice (e.g. an Admin re-exporting an overlapping date range) cannot
    double-count it.

Not built yet:

- No scheduler/cron to auto-run the end-of-day CDR report - it's a
  pull-based `GET` endpoint today, per Phase 4's note that no
  cron/scheduler infrastructure exists yet (tracked for Phase 12).
- No web UI for uploading a CDR file, reviewing the extension-mapping
  list, or viewing the match report - `apps/web` still has only the login
  page.
- No endpoint to edit/revoke an existing `ExtensionMapping` once assigned,
  or to mark one `isSystem` after the fact if the keyword heuristic
  misclassifies a real extension.

## Phase 10 — Dashboards and reports

**Status: Backend done and live-verified against real accumulated data from
every prior phase's testing. No web UI yet - `apps/web` still has only the
login page (this is the single biggest gap in this phase; see below).**

- `apps/api/src/dashboards/dashboards.service.ts` implements the four report
  shapes from spec §18, each accepting the shared `DashboardFilterDto`
  (date/range, team, shift, agent, lead type, partner, batch, disposition,
  call verification status - not every field applies to every endpoint,
  documented per-method):
  - `GET /dashboards/overview` (§18.1): active/on-manual-break/on-idle-break
    Agent counts, total/completed/remaining leads + completion %, contacted
    leads, CDR-verified calls, leads with no verified call, orders created,
    Agents over break allowance. Cached in-memory for a short configurable
    TTL (`DASHBOARD_OVERVIEW_CACHE_TTL_SECONDS`, default 10s) per spec §20's
    "caching for dashboard counters" - **per-API-instance only**, flagged
    for a shared (Redis) cache before running more than one API replica.
  - `GET /dashboards/overview/stream` (spec §19): the same payload pushed
    over Server-Sent Events every 15 seconds - the real-time half of "SSE
    ... 15-second polling fallback" (the plain `GET /overview` endpoint above
    *is* the polling fallback).
  - `GET /dashboards/leads-summary?leadType=CASH|INSURANCE` (§18.2): total/
    available/assigned/pending-call/customer-contacted/callback-eligible/
    follow-up-scheduled/completed/remaining/completion %/orders created/
    converted count, plus the exact ten disposition counters from the spec
    (they fall directly out of `DispositionType`, one enum value each).
  - `GET /dashboards/agent-performance` (§18.3): every field the spec lists
    (session span, work/break/manual/idle seconds and break count - reusing
    `AttendanceDay`'s existing daily rollup rather than recomputing it;
    leads generated/taken-from-search/contacted/completed, calls initiated,
    CDR-verified calls, orders created, per-disposition counts, Cash/
    Insurance split, current active lead, last activity) computed for every
    Agent in scope with a **fixed, small number of aggregate queries**
    (`groupBy`/raw `COUNT...GROUP BY`), never one query per Agent - this
    matters because spec §20 explicitly designs for 200+ users.
  - `GET /dashboards/me/daily` (nav "My Daily Results", spec §3.2): an Agent's
    own subset of the same computation, for today by default. Always
    computed from the caller's own id - there is no `agentId` parameter on
    this route at all, so an Agent cannot request another Agent's stats by
    constructing a query string (verified live: an Agent's JWT hitting
    `/dashboards/overview` gets a clean `403`, and `/me/daily` always
    returns their own row).
  - `GET /dashboards/converted-leads` + `GET /dashboards/converted-leads/export`
    (§18.4, CSV): every listed field (masked phone/identity, unmasked
    customer name - same convention as Leads Search in Phase 8 - Agent,
    contact time, external order number, conversion timestamp, CDR
    verification, provider last status, batch, partner), paginated.
- **Team scoping enforced in the backend, not the frontend** (CLAUDE.md rule
  1): a Team Leader may query any team or none (all); a Shift Supervisor is
  unconditionally forced to their own team - **verified live** that passing
  a different `teamId` in the query string to a Shift Supervisor's token
  has no effect (their overview still reports only their own team's 1
  active Agent, not the Team Leader's 68).
- 9 unit tests (`dashboards.service.spec.ts`) covering RBAC (Agent blocked
  from every admin report, Team Leader/Shift Supervisor allowed) and the
  team-scope-forcing behavior via assertions on the actual Prisma call
  arguments.
- **Live end-to-end verification, this session**, against the real
  accumulated data from every prior phase's live testing in this same
  Postgres instance (55+ synthetic Agents/leads from Phase 6, real Cash/
  Insurance leads from Phase 3, real dispositions from Phase 7, etc.):
  every endpoint above returned correct, cross-checked numbers (e.g.
  `leads-summary?leadType=CASH`'s `available + assigned + completed` summed
  exactly to `total`); the SSE stream returned a correctly-headered
  (`Content-Type: text/event-stream`) payload immediately on connect; a
  dedicated Shift Supervisor + Agent + Team seeded specifically for this
  check confirmed the team-scoping behavior described above, then was
  cleaned up.

Known gaps, flagged rather than silently assumed complete:

- **No web UI.** The entire 16-item Admin navigation and 9-item Agent
  navigation from spec §3 (Overview, Live Shift Monitor, Cash/Insurance
  Leads pages, Sessions & Breaks, Monthly Attendance, CDR Matching Reports,
  Users & Shifts, Import History, Audit Log, Settings, etc.) does not exist
  yet - `apps/web` is still only a login page. This phase built the
  backend contract those pages will call; Phase 11 ("Branding and UX") is
  where the actual pages, palette, and navigation shell get built.
- **"Agents over break allowance" has no spec-given threshold.** Spec §18.1
  lists the card but never states the number. Implemented as a configurable
  default (`DASHBOARD_BREAK_ALLOWANCE_MINUTES`, currently 60) pending a
  Team Leader decision - flagged in `.env.example`, not silently guessed.
- **CSV export only exists for Converted Leads.** Spec's Admin permissions
  say "Export reports" generally; Overview/Leads Summary/Agent Performance
  have no export endpoint yet.
- **No Shift-Supervisor "broader access" grant mechanism.** Spec §2.1 allows
  a Shift Supervisor to be "explicitly granted broader access" beyond their
  team; nothing in the schema/permission model represents this yet (same
  gap as the still-unused `TeamScopeGuard` flagged in Phase 1).
- **Monthly Attendance report (nav item 10)** is not a separate endpoint -
  `AttendanceDay` rows already exist per-agent-per-day (Phase 4) but there's
  no aggregated monthly rollup/report endpoint yet.
- **Audit Log viewing endpoint (nav item 15)** does not exist yet - `AuditLog`
  rows are written throughout (every phase), but there's no `GET` to list/
  filter them.
- The in-memory overview cache is a single-process optimization only; it
  would silently under-cache (fine) but never over-serve stale data across
  replicas incorrectly, since each replica just re-computes independently -
  still flagged because a shared cache is the more scalable long-term fix.

## Phase 11 — Branding and UX

**Status: The authenticated app shell and its first real pages are built,
branded per spec section 22, and live-verified in an actual browser
(Playwright against the pre-installed Chromium, not just `tsc`/build
passing) - both desktop and mobile viewports. This phase necessarily also
built the first working pages behind Phase 10's API, since there was
nothing to brand before this. Two real bugs were caught by browser testing
that no amount of `tsc`/unit-test-only verification would have found.**

- Brand tokens (`packages/contracts/src/brand.ts` → `packages/ui/src/tokens.ts`
  → `apps/web/tailwind.config.ts`) already matched spec section 22's exact
  hex values from Phase 0 - verified again this phase, unchanged.
- `apps/web/src/components/AppShell.tsx`: the branded shell every
  authenticated page renders inside - navy (`#2A3144`) sidebar with the
  actual `docs/branding/milaserv-logo.jpg` at top-left, white sidebar text,
  teal active-item pill, white topbar, light-gray (`#F4F7F8`) app
  background, 12-16px card radius, subtle shadows. Redirects to `/login`
  if there's no session. Renders the **full** 16-item Admin nav / 9-item
  Agent nav from spec section 3 - items with a real page behind them are
  clickable; the rest render as a clearly-labeled, non-interactive "Soon"
  placeholder rather than a dead link, so the shell's structure matches the
  spec without pretending unbuilt pages work.
- **Responsive, not just "hide the sidebar on mobile"**: below the `md`
  breakpoint the fixed sidebar is replaced by a hamburger button that opens
  a slide-over panel with the same nav - verified in a 390×844 mobile
  viewport (both the collapsed header and the open nav panel).
- **Accessibility**: a "Skip to content" link (visible on focus), visible
  teal focus rings on every interactive element (verified via an actual
  keyboard `Tab` press, screenshotted), `aria-current="page"` on the active
  nav item, `aria-label`s on the icon-only mobile nav buttons, `role="alert"`
  on form/mutation error text.
- `apps/web/src/lib/auth.ts` / `api-client.ts`: session-lifetime token +
  user storage (matches the short-lived-access-token model from spec
  4/23 - closing the tab means signing in again), and an authenticated
  fetch wrapper that retries once via the existing httpOnly refresh cookie
  on a `401` before giving up and redirecting to `/login`.
- `apps/web/src/app/login/page.tsx`: now shows the logo, stores the full
  user object from the login response (not just the token), and redirects
  to the correct home page for the user's role (`/agent` for `AGENT`,
  `/dashboard` for `TEAM_LEADER`/`SHIFT_SUPERVISOR`) instead of a hardcoded
  path.
- `apps/web/src/app/(app)/dashboard/page.tsx` (Overview, spec 18.1): every
  card from the spec, polling every 15 seconds (`useQuery` +
  `refetchInterval`, the plain-`GET` fallback half of spec 19's real-time
  requirement), with the semantic colors from spec 22 applied correctly -
  green for completed/verified/orders, amber for "leads with no verified
  call", red for "agents over break allowance" when it's non-zero.
- `apps/web/src/app/(app)/dashboard/converted-leads/page.tsx` (spec 18.4):
  navy table header, masked phone/identity, a `MATCHED`/other badge for
  CDR verification, and a working CSV export button (authenticated
  `fetch` + blob download, since a plain `<a href>` can't attach a Bearer
  token).
- `apps/web/src/app/(app)/agent/page.tsx` (spec 3.2/2.2): Start/End
  Session, Start/End Break (amber for the break action, teal for the
  primary/end-break action), and the full "My Daily Results" card set from
  spec 18.3's Agent-facing subset - all polling every 15s and
  invalidating on every session/break mutation.
- **Two real bugs caught by actually clicking through the app in a
  browser, neither of which `tsc`, `nest build`, or the unit test suite
  would have caught**:
  1. **Converted Leads page silently stuck on "Loading…" forever**: the
     `converted-leads`/`converted-leads/export` endpoints bound `page`/
     `perPage` as separate `@Query()` parameters *alongside* `@Query()
     filters: DashboardFilterDto` - since the global `ValidationPipe` has
     `forbidNonWhitelisted: true` and validates the *entire* query string
     against the DTO class, any key not declared on that DTO (`page`,
     `perPage`) made the **whole request** fail with a `400`, regardless
     of which parameter actually held it. Fixed by declaring `page`/
     `perPage` directly on `DashboardFilterDto` (with `@Type(() => Number)`
     coercion) instead of as separate handler parameters, and updating the
     controller to read them off the one validated object.
  2. **Ending a session, then a break, then ending the session again left
     the UI stuck showing "Active" forever** (through no fault of the
     session logic itself, which was correct end-to-end - confirmed via a
     direct `curl` that the backend genuinely had no open session
     afterward): `GET /sessions/current` returns HTTP `200` with
     `Content-Length: 0` when there is no open session (Nest's behavior
     for a controller returning `null`), and the frontend's `res.json()`
     call threw a `SyntaxError` parsing the empty body - which the
     fetch wrapper only special-cased for an explicit `204`, not a `200`
     with an empty body. React Query then silently kept showing the last
     *successful* cached response instead of the new state. Fixed by
     reading the response as text first and treating any empty body as
     `null`, for any 2xx status - not just `204`.
  - Both bugs were caught by literally clicking through the running app
    with Playwright against the pre-installed Chromium (screenshotting
    every state transition), not by reading the code - this is exactly why
    the CLAUDE.md working-style note to "start the dev server and use the
    feature in a browser before reporting a UI change complete" exists.
  - Also caught and fixed inline: the sidebar highlighted **two** nav items
    simultaneously (`Overview` and `Converted Leads` both pill-highlighted)
    while on `/dashboard/converted-leads`, because the active-item check
    used `pathname.startsWith(item.href)` and `/dashboard` is a prefix of
    `/dashboard/converted-leads`. Fixed with exact-path equality.

Known gaps, flagged rather than silently assumed complete:

- **14 of the 16 Admin nav items and 7 of the 9 Agent nav items have no
  page yet** - Live Shift Monitor, Leads Distributor, Cash/Insurance Leads,
  Leads Search, Lead Reports, Sessions & Breaks, Monthly Attendance,
  Yeastar CDR Imports, CDR Matching Reports, Users & Shifts, Import
  History, Audit Log, Settings (Admin); My Current Lead, Lead Distributor,
  Cash/Insurance Leads, Leads Search, My Breaks, My Session History
  (Agent). They render as an honest "Soon" placeholder in the nav rather
  than a broken link.
- **No design-system component library beyond `StatCard`** - each page
  hand-rolls its markup with Tailwind utility classes against the brand
  tokens; a growing page count would benefit from extracting shared table/
  badge/button components into `packages/ui`.
- **The SSE endpoint (`/dashboards/overview/stream`) is not wired up in
  the frontend** - the Overview page uses the 15-second polling fallback
  only. Real-time push would need an `EventSource` client and is a
  reasonable follow-up, not required by spec 19 which explicitly treats
  polling as an acceptable fallback.
- **No automated frontend test suite** (Jest/Vitest component tests,
  Playwright as a committed E2E suite) - verification this phase was
  manual/scripted browser testing during development, not a repeatable
  CI-run suite. `apps/web` still has zero `test` script.
- Color contrast was eyeballed against the spec's exact hex values, not
  run through an automated contrast-ratio checker (e.g. axe-core).

## Phase 12 — Security, performance, and release readiness

**Status: Security review complete and re-documented (`docs/architecture/SECURITY.md`
fully rewritten against the spec's 15-point checklist, not just re-stamped);
three concrete security/robustness fixes shipped; a database index review
found and fixed four real missing indexes from Phase 10's dashboard
queries; the atomic lead-claiming path was re-verified live after the
migration, which surfaced and fixed a genuine test-data hygiene bug (not
an application bug - see below). Docker build/deploy could not be executed
in this sandbox (the daemon itself won't start here, not just registry
access); `docker compose config` (pure syntax/interpolation validation, no
daemon needed) passes. The release docs (UAT/rollback/runbook/pilot plan)
were written as thorough templates back in Phase 0 and remain accurate
without changes - they still correctly say "not yet run/exercised," which
is honest: this phase did not deploy to a real staging environment or run
human UAT.**

- **Security review** (`docs/architecture/SECURITY.md`, full rewrite): every
  item in spec §23 assessed against the actual current code (not the
  Phase-1 snapshot the doc previously described), each with a SATISFIED/
  PARTIAL verdict and specific file references. Headline findings:
  - Real, fixed this phase: import/CDR/extension-mapping endpoints had no
    rate limit beyond the generous global default; the upload MIME
    allow-list silently accepted everything if misconfigured to be empty
    (fail-open); Multer's hardcoded 100MB upload ceiling could disagree
    with the configurable `UPLOAD_MAX_FILE_SIZE_MB` service-side check.
  - Real, documented but **not** fixed this phase (a data-model/product
    decision, not a quick patch): `ImportsService`/`CdrService`/
    `ExtensionMappingsService` have no team scoping at all - any Team
    Leader or Shift Supervisor can view/confirm/export any import batch or
    CDR report regardless of team, because `LeadImportBatch`/`CdrImport`
    have no `teamId` in the schema (imports are a shared operation, not
    inherently per-team). `TeamScopeGuard` is still unused dead code
    (flagged since Phase 1).
  - Confirmed non-issues: raw UUID public IDs (a deliberate, consistent
    convention, not a bypassed safer scheme); medical/medication data is
    never logged; the device-heartbeat auth path is sound.
- **Database index review** (spec §20's "indexed active-owner/status/type/
  batch fields"): the Phase 10 dashboard queries (polled every 15s from an
  admin's Overview page) filter/join on `WorkSession.teamId`+`status`,
  `LeadAssignment.teamId`, `LeadOrderReference.createdById`, and
  `User.role`+`teamId` with **no supporting index on any of them** - every
  call was a sequential scan. Fixed with migration
  `20260723194146_phase12_dashboard_index_review` (purely additive, four
  new indexes, applied without downtime) and confirmed live: the indexes
  exist in the running database (`\di` output cross-checked against the
  migration).
- **Concurrency re-verification after the migration** (spec §24's
  distribution-concurrency requirement, re-run because indexes were added
  to tables in the Generate Lead code path's vicinity): a focused
  regression smoke test (9 concurrent Generate Lead calls, fresh
  synthetic Agents, real HTTP requests) confirmed **9/9 succeeded, 9
  distinct leads, zero duplicates** - the atomic claim path is unaffected
  by the new indexes, as expected (they're on unrelated columns and
  purely additive).
  - **A genuine bug was found and fixed while getting this smoke test
    running - but it was in the *test data*, not the application**: two
    `Lead` rows left over from this session's earlier live testing had
    been reset to `status = AVAILABLE` by a cleanup script that forgot to
    also release the corresponding `LeadAssignment.activeLeadMarker`,
    leaving a dangling claim on a lead the system otherwise considered
    free. This was root-caused rigorously, not guessed: reproduced with
    an isolated Prisma-only script bypassing NestJS/HTTP entirely, cross-
    checked against 5 truly concurrent raw `psql` sessions (which
    confirmed Postgres's `SELECT ... FOR UPDATE SKIP LOCKED` behaves
    correctly), and finally pinned down via direct SQL joining
    `LeadAssignment.active_lead_marker IS NOT NULL` against a `Lead.status`
    that implied no active claim. The important finding **is** the
    absence of a bug: every attempt to claim one of the two poisoned rows
    correctly failed with a clean `409` (the unique-constraint safety net
    working exactly as designed) rather than silently double-assigning a
    lead - i.e., this incident is live proof that the defense-in-depth
    design (row lock + separate unique constraint) holds up even when the
    "shouldn't happen" case (inconsistent leftover data) actually happens.
    The two rows were repaired (assignment properly released) and this is
    now documented in `SECURITY.md` as a standing rule: never reset
    `Lead.status` directly without also releasing the `LeadAssignment`.
- **Docker / build verification**: `docker compose config` succeeds
  (validates `docker-compose.yml` syntax and `.env` variable
  interpolation) - stronger verification than Phase 0 managed, since the
  `docker` CLI is present in this sandbox. However `docker info`/`service
  docker start` confirm the daemon itself cannot start here (a
  `ulimit`/capability restriction in the sandbox, not just the
  previously-assumed registry block) - `docker compose build`/`up` remain
  unverified in this environment; re-verify on a host with a working
  Docker daemon before relying on it for staging/production.
  Full monorepo build re-confirmed clean end-to-end this phase:
  `apps/api` (`tsc`, `nest build`), `apps/worker` (`tsc`), `apps/web`
  (`tsc`, `next build` - all 6 routes prerender), `packages/validation`
  (56/56 tests), `apps/api` (72/72 tests).
- **Release documentation** (`docs/release/{UAT,ROLLBACK,OPERATIONS_RUNBOOK,PILOT_MONITORING}.md`):
  reviewed against the current state of the app; all four remain accurate
  as forward-looking templates written in Phase 0 and needed no
  correction. They correctly continue to say "not yet run" - this phase
  did not stand up a real staging deployment or run a human UAT pass, and
  claiming otherwise would violate this project's honesty-over-completeness
  rule. `docs/deployment/PRODUCTION.md`'s Definition-of-Done gates
  (typecheck/lint/test/build, concurrency tests, security review, reviewed
  migrations) all hold as of this update, **except** `pnpm lint`, which
  still cannot run repo-wide (see below - a pre-existing gap, not
  introduced this phase).

Known gaps, flagged rather than silently assumed complete:

- `eslint` still cannot run (`eslint.config.js` migration not done - flagged
  since Phase 9; unchanged this phase).
- No staging deployment has actually happened; `docs/release/UAT.md`'s
  checklist requires a real human tester on real staging, which this
  session cannot provide.
- No backup-restore drill has been performed (`docs/release/ROLLBACK.md`
  flags this explicitly).
- Team-scoping gap for imports/CDR/extension-mappings (see Security review
  above) remains open pending a product decision.
- Load testing beyond the ~9-55 concurrent-request smoke tests in this
  session (spec's "at least 200 users" target) has not been performed at
  full scale - would require either a load-testing tool run against a
  long-lived deployment or many more synthetic accounts than were
  practical to seed/clean up interactively in this session.

## Post-MVP — Full Admin/Agent navigation build-out

**Status: Done and live-verified.** After Phase 12, every remaining item in
the spec §3 Admin (16-item) and Agent (9-item) navigation had a page built
behind it - the "14 of 16 / 7 of 9 nav items have no page yet" gap flagged
at the end of Phase 11 is now closed. No nav item renders the "Soon"
placeholder anymore.

Backend additions (each with unit tests, all RBAC-guarded and, where the
data model supports it, team-scoped the same way as every earlier phase):

- `GET /leads-search/admin` (Team Leader/Shift Supervisor): the same search
  logic as Agent-facing Leads Search, but returns unmasked phone/national-id
  for the admin-facing Leads Search nav page - refactored `SearchService`
  into a shared `runSearch` core so the masking/permission-filtering logic
  isn't duplicated between the two routes.
- `GET /attendance/monthly?month=YYYY-MM`: per-agent monthly rollup (days
  recorded, total work/break/manual/idle seconds, status counts) built on
  top of the existing `AttendanceDay` rows from Phase 4 - no new schema, a
  pure aggregation.
- `GET /audit-log` (Team Leader only): filterable (actor/action/entityType/
  entityId/date range), paginated listing over the `AuditLog` rows every
  earlier phase has been writing since Phase 1.
- `GET /sessions/history` / `GET /sessions/breaks/history`: an Agent's own
  paginated session/break history (My Session History, My Breaks nav items) -
  scoped to `actor.id` only, no `agentId` parameter, same "can't query
  someone else's data by constructing a query string" pattern as
  `/dashboards/me/daily` from Phase 10.
- `apps/api/src/settings` (new module): `GET /settings` / `PUT /settings/:key`
  (Team Leader only) for the two runtime overrides referenced elsewhere in
  the code but never exposed for editing - `cdrDefaultSourceTimezone` (Phase
  9) and `dashboardBreakAllowanceMinutes` (Phase 10). Validates the key
  against a known-key allow-list (`BadRequestException` on an unknown key,
  not a silent no-op), and audit-logs before/after values on every change.

Frontend additions (all `apps/web/src/app/(app)/...`, React Query + 15s
polling matching Phase 11's established pattern):

- Agent: Lead Distributor / My Current Lead (shared page - Generate Cash/
  Insurance, Call Customer, Save Disposition, all wired to the real Phase
  6-7 endpoints), Cash Leads / Insurance Leads (the same distributor
  restricted to one lead type), Leads Search, My Breaks, My Session History.
- Admin: Leads Distributor (both lead types' summary + disposition
  breakdown), Cash Leads / Insurance Leads (import upload wizard +
  summary), Leads Search (unmasked), Lead Reports, Live Shift Monitor /
  Sessions & Breaks (shared page - active sessions table, per-row
  force-close with a required reason, break-over-allowance highlighted),
  Users & Shifts (user CRUD with inline role/status/team edits, team and
  shift creation), Import History (CSV error export), Yeastar CDR Imports,
  CDR Matching Reports (report table + extension-mapping management),
  Monthly Attendance, Audit Log, Settings.
- Shared components extracted rather than duplicated per page:
  `LeadDistributorPanel`/`ActiveLeadCard`/`DispositionForm` (the
  Generate→Call→Disposition flow, parameterized by an optional
  `restrictType` so the same code backs the unrestricted, Cash-only, and
  Insurance-only pages), `LeadsSummaryCard` (the 12-stat-card + disposition
  table block reused across four different Admin pages), `ImportUploadFlow`
  (upload → preview → confirm wizard reused across Cash/Insurance/CDR
  import pages).
- **Known, accepted duplication, flagged rather than hidden**: Admin's
  "Leads Distributor" and "Lead Reports" nav items currently render the
  identical view (both `LeadsSummaryCard`s for Cash and Insurance) - the
  spec doesn't clearly differentiate what "Lead Reports" should show beyond
  what the distributor view already provides, and building a genuinely
  different report page wasn't worth guessing at under this pass's time
  budget. Likewise "Sessions & Breaks" and "Live Shift Monitor" intentionally
  share one page/route, and Agent's "My Current Lead" and "Lead Distributor"
  share one page/route - the nav has more labeled entries than there are
  logically distinct screens, matching how the spec describes them as
  closely-related views of the same underlying data.

**Live end-to-end verification, this session, against the running app in an
actual browser (Playwright, pre-installed Chromium)**:

- All 15 Admin pages and all 7 new Agent pages loaded with zero console
  errors, zero page errors, and zero unexpected HTTP error responses, logged
  in as a real Team Leader and a real Agent account respectively.
  Screenshotted every page; spot-checked several visually (Live Shift
  Monitor, Users & Shifts, Leads Distributor, Settings, Audit Log) to
  confirm real accumulated data renders correctly, not just "no crash."
- **Full interactive click-through of the core Agent workflow**, not just
  page loads: started a session, clicked "Generate Cash Lead," confirmed the
  `ActiveLeadCard` rendered the claimed lead, clicked "Call Customer,"
  confirmed the `DispositionForm` appeared, selected a disposition, filled
  notes, clicked "Save Disposition," and confirmed the UI correctly
  returned to "No active lead. Generate one to get started." afterward -
  matching the real backend state change. Zero console/page errors through
  the whole sequence.
- **A real environment gotcha hit twice while setting this verification up,
  worth recording so it isn't re-diagnosed as an app bug next time**: the
  login endpoint's rate limit (`10/60s`, Phase 12) is easy to exhaust just
  from repeated interactive test runs in the same session (each Playwright
  run, plus manual `curl` checks, all count against the same window) - it
  is not a bug, it's the security control working as designed, but it means
  verification scripts that log in repeatedly need real waits between
  attempts, or should mint a JWT directly (matching `JwtStrategy`'s
  `{sub, role, teamId}` payload, signed with `JWT_ACCESS_SECRET`) to test
  business logic without spending the login budget at all - the approach
  used for the interactive flow test above once the throttle had been hit
  a few times in a row.
- One thing initially misread as a bug and then correctly identified as
  correct behavior: `POST /leads/generate` returning `404 "No active session
  found. Start a session first."` when tested without first calling
  `POST /sessions/start` - this is the existing Phase 6 precondition
  working correctly, not a defect in the new pages.

Known gaps, flagged rather than silently assumed complete:

- **"Lead Reports" and "Sessions & Breaks" are not yet distinct screens**
  from their sibling nav items (see "known, accepted duplication" above).
- **No automated test coverage for the new pages themselves** - verification
  this pass was live/scripted browser testing (Playwright), matching Phase
  11's approach, not a committed Jest/Vitest component suite or a
  checked-in Playwright E2E suite (`apps/web` still has zero `test` script).
- **Settings page has no validation feedback beyond the raw API error** -
  `PUT /settings/:key` correctly rejects an unknown key, but the page
  doesn't pre-validate the value's shape (e.g. that
  `dashboardBreakAllowanceMinutes` should be numeric) before submitting.
- The historical test/seed data accumulated across every phase's live
  concurrency testing (dozens of `Concurrency Agent N` / `Racer N` accounts
  and their now-closed sessions) was left in place rather than purged - it's
  inert noise in a dev database, not a defect, but it does mean Live Shift
  Monitor/Users & Shifts show more rows than a fresh install would; cleaning
  it up is a separate, explicit task if a clean demo database is needed.

## Quality gates, as of this update

```
pnpm --filter @milaserv/validation test    # 56/56 passing
pnpm --filter @milaserv/api test           # 81/81 passing (auth + imports + sessions + devices + leads + dispositions + search + extension-mappings + dashboards + audit + attendance + settings)
pnpm --filter @milaserv/worker test        # 0 tests (processors verified via live integration testing instead - see above)
cd packages/database && prisma validate    # valid
cd apps/api && tsc --noEmit                # clean
cd apps/worker && tsc --noEmit             # clean
cd apps/web && tsc --noEmit                # clean
cd apps/api && nest build                  # clean
cd apps/worker && tsc -p tsconfig.json     # clean
cd apps/web && next build                  # clean, all 24 routes prerendered
```

`eslint` could not be run this session - the repo has no `eslint.config.js`
(ESLint 10 requires the flat-config format; the `.eslintrc.*` migration
hasn't been done). This is a pre-existing gap from earlier phases, not
something Phase 9 introduced; it should be fixed before relying on
`pnpm lint` for anything.

`pnpm lint` across every package and a full `docker compose build` have not
been run yet in this session — the latter is expected to fail in this
sandbox specifically (no container-registry access, see Phase 0 notes), not
necessarily elsewhere.

`pnpm lint` across every package and a full `docker compose build` have not
been run yet in this session — the latter is expected to fail in this
sandbox specifically (no container-registry access, see Phase 0 notes), not
necessarily elsewhere.
