# Test Plan

Source of truth for required tests:
`docs/specifications/MILASERV_CRM360_MVP.md` §24. This document maps each
required test to where it lives (or will live) in the codebase and its
current status.

## Legend

- ✅ implemented and passing
- 🚧 planned, not yet implemented
- N/A not applicable to current phase

## Auth / RBAC (Phase 1)

| Test | Location | Status |
|---|---|---|
| Unknown email does not reveal account existence | `apps/api/src/auth/auth.service.spec.ts` | ✅ |
| Account locks after configured failed-attempt threshold | same | ✅ |
| Locked account rejected even with correct password | same | ✅ |
| Failed-attempt counter resets on successful login | same | ✅ |
| Revoked/expired refresh token rejected | same | ✅ |
| Agent blocked from admin endpoints (403) | manual curl, this session | 🚧 needs an automated e2e test |
| Shift Supervisor limited to assigned team scope | service-layer logic exists (`UsersService.scopeFilter`, `TeamsService`, `ShiftsService.assertTeamScope`) | 🚧 no automated test yet |
| Hidden frontend action still blocked by backend | global `JwtAuthGuard`/`RolesGuard` design | 🚧 no automated test yet |

## Phone / date / price parsing (Phase 0, ahead of Phase 3)

| Test | Location | Status |
|---|---|---|
| All equivalent Saudi phone input forms normalize identically | `packages/validation/src/phone.test.ts` | ✅ 9 cases |
| Invalid phone input rejected | same | ✅ |
| Mask keeps prefix + last 2 digits only | same | ✅ |
| `1.26K` price parses to 1260, raw retained | `packages/validation/src/price.test.ts` | ✅ |
| Plain numeric/zero prices parse correctly | same | ✅ |
| Invalid price flagged, not silently coerced | same | ✅ |
| DD/MM/YYYY and MM/DD/YYYY parse per explicit format (no guessing) | `packages/validation/src/dates.test.ts` | ✅ |
| Impossible dates rejected | same | ✅ |
| 2-digit years (as actually rendered by the real sample files) expand correctly | same | ✅ (caught a real bug live: unparsed 2-digit years silently produced year 26 AD) |
| Refill date calculation | same | ✅ |
| Refill period outside 26–80 rejected | same | ✅ |
| Cash legacy status mapping (`Answered - No Order` etc.) | `packages/validation/src/cash-legacy-status.test.ts` | ✅ |
| Legacy `Agent` label "Name (ext)" parsing | same | ✅ |
| Cash/Insurance grouping and item key precedence (preferred + fallback) | `packages/validation/src/grouping-keys.test.ts` | ✅ |

## Import framework (Phase 2)

| Test | Location | Status |
|---|---|---|
| Spreadsheet row parsing preserves exact source row numbers across blank rows | `packages/validation/src/sheet.test.ts` | ✅ (caught a real SheetJS default-behavior bug live, fixed with `blankrows: true`) |
| Required-column detection matches the real Cash/Insurance sample headers | `packages/validation/src/import-columns.test.ts` | ✅ |
| Empty-required-field detection | same | ✅ |
| Upload/create-batch restricted to Team Leader | `apps/api/src/imports/imports.service.spec.ts` | ✅ |
| Preview/confirm reject batches in the wrong status | same | ✅ |
| End-to-end: upload real `cash_leads.xlsx` → preview → confirm → worker → `COMPLETED_WITH_ERRORS`, with row-accurate error reporting | manual, this session (see `docs/implementation/IMPLEMENTATION_STATUS.md`) | ✅ verified live, 🚧 not yet an automated integration test against a real DB |
| End-to-end: upload real `med_gulf_sample.xlsx` → preview → all rows valid | same | ✅ verified live, 🚧 not automated |
| Re-uploading an identical file is flagged `alreadyUploadedBefore` | same | ✅ verified live, 🚧 not automated |
| In-file duplicate row detection | same (rows 23–28 of `cash_leads.xlsx`, which are genuinely blank duplicates) | ✅ verified live, 🚧 not automated |

## Cash and Insurance parsers (Phase 3)

All verified live against a real Postgres instance, starting from empty
`leads`/`people` tables (see `docs/implementation/IMPLEMENTATION_STATUS.md`
for full detail) - not yet automated as integration tests:

| Test | Status |
|---|---|
| Insurance grouping: multiple medication rows for the same claim → one lead, items separate | ✅ verified live (18 rows → 8 leads/18 items) |
| Insurance long ids preserved exactly (national id, claim/invoice numbers) | ✅ verified live, spot-checked in the DB, no precision loss/scientific notation |
| Cash grouping: repeated phone/date/branch rows → one lead with multiple items | ✅ verified live (the real `500210989`/`P440` pair merged into one 2-item lead) |
| Ambiguous date format requires explicit selection | ✅ enforced (`MISSING_DATE_FORMAT` batch failure if unset); 🚧 no automated test of the rejection path yet |
| `1.26K` price parsing end-to-end through the Cash processor | ✅ verified live (parsed and stored as `1260`) |
| Raw values preserved (`LeadImportRow.rawData`) | ✅ verified live |
| Grouping/item-key idempotency across separate import batches (not just within one file) | ✅ verified live: re-uploaded and fully re-processed the identical `cash_leads.xlsx`; lead count stayed 18, item count stayed 19 |
| Rows that fail Cash/Insurance-specific parsing (bad phone/date) despite passing Phase 2's structural check are recorded as new import errors | ✅ implemented (`CASH_PARSE_FAILED`/`INSURANCE_PARSE_FAILED`); 🚧 not yet exercised against a real malformed row in this session's testing |

## Sessions, breaks, attendance (Phase 4)

| Test | Location | Status |
|---|---|---|
| Africa/Cairo calendar-day conversion, including a UTC-day/Cairo-day rollover case | `packages/validation/src/timezone.test.ts` | ✅ |
| Double `Start Session` gets a clean conflict, not a race | `apps/api/src/sessions/sessions.service.spec.ts` + verified live | ✅ |
| Cannot start/end a break without an open session | same | ✅ |
| Cannot start a break while already on break; cannot end a break when not on break | same | ✅ |
| Cannot end a session while on break | same | ✅ |
| Work-seconds calculation excludes break time | same | ✅ |
| Attendance rollup: `WORKED_NO_BREAK` vs `PRESENT` vs `FORCE_CLOSED` | ✅ verified live (`PRESENT` with `breakCount: 1` after a real break) for PRESENT/WORKED_NO_BREAK; 🚧 FORCE_CLOSED rollup not yet exercised through `recomputeDay` specifically (force-close itself was verified) |
| Live end-to-end: start session → break → end break → end session → attendance rollup correct | manual, this session | ✅ |
| Admin session monitor scoped correctly; Agent forbidden from force-close; Team Leader force-close records reason | manual, this session | ✅ |

Not yet built (see `docs/implementation/IMPLEMENTATION_STATUS.md`):

- Idle break exact-threshold test (Phase 5, requires the activity companion / heartbeat endpoint). 🚧
- Cross-midnight session splitting / day-boundary sweep. 🚧
- `PARTIAL_SESSION`/`VACATION`/`DAY_OFF`/`ABSENT` classification. 🚧

## Lead distribution (Phase 6)

These are the highest-risk paths in the whole system and were run against a
real Postgres instance with genuinely concurrent (`Promise.all`) HTTP
requests, not mocks - a mocked Prisma client cannot prove atomicity, and in
fact this live testing caught two bugs (a raw-SQL enum comparison, and a
too-short transaction timeout under real contention) that every mocked unit
test passed right through. See `docs/implementation/IMPLEMENTATION_STATUS.md`
for full detail.

| Test | Status |
|---|---|
| Generate Lead: ≥50 concurrent requests, no duplicate lead, one active lead per Agent | ✅ verified live: 55 real Agents, 70 available leads, 55 concurrent requests → 55/55 succeeded, 55 distinct leads, 0 duplicates, exactly 55 active `LeadAssignment` rows |
| Take Lead: two (or more) Agents simultaneously, exactly one succeeds, correct history | ✅ verified live: 10 real Agents racing for one lead → exactly 1 success, 9 conflicts with the exact spec-mandated message, exactly 1 `LeadAssignment` row total (losers wrote nothing) |
| Session/permission/no-existing-active-lead preconditions | `apps/api/src/leads/leads.service.spec.ts` | ✅ 9 unit tests |
| Unique-constraint race (same Agent, two near-simultaneous claims) converted to a clean 409 | same + live-tested indirectly via the 55-agent run | ✅ |

Releasing an active lead is now built (Phase 7 dispositions).

## Leads Search (Phase 8)

| Test | Status |
|---|---|
| Search hides medication/pricing/medical/insurance-financial data - verified against the actual API response, not the UI | ✅ unit tested (exact-key-set assertion) + **verified live** against a real Cash lead with two medication items |
| Different national IDs sharing a phone are returned as separate households, never merged | ✅ unit tested + verified live |
| Customer name shown unmasked, phone/identity masked | ✅ verified live |
| Results filtered by the caller's lead-type/partner permissions | ✅ unit tested |
| Query below minimum length rejected | ✅ unit tested + verified live (`400`) |
| Search results are rate-limited | ✅ implemented (30/min); 🚧 not yet exercised against the actual limit |

Not yet built: partial/fuzzy search (only exact phone/national-id match exists).

## Dispositions (Phase 7)

| Test | Status |
|---|---|
| Call Customer requires ownership + active session; creates a CallAttempt; PENDING_CALL → CUSTOMER_CONTACTED | ✅ unit tested + live |
| Disposition requires CUSTOMER_CONTACTED first | ✅ unit tested |
| No Answer/Busy: Agent A owns → saves disposition → released → Callback Eligible → Agent B takes → Agent C cannot take → Agent A history intact | ✅ **committed automated e2e test** (`apps/api/test/no-answer-busy.e2e-spec.ts`, run via `pnpm --filter @milaserv/api test:e2e`) - real HTTP requests via supertest against a real Postgres, a genuine concurrent race between two agents (`Promise.all`), asserting the DB's assignment rows directly (exactly 2 total, Agent A's original released-not-deleted, exactly one of B/C active). Previously only verified via ad-hoc manual live testing (not repeatable); this closes that gap. Also caught and fixed a real infra bug: `test:e2e` was a declared-but-broken script with no `test/` directory or `jest-e2e.json` behind it at all until this pass. |
| Follow-up: remains owned, not Take-Lead-eligible | ✅ unit tested (`leadAssignment.update` confirmed *not* called) |
| Follow-up: supervisor can reassign with reason | 🚧 not built - no reassignment endpoint yet |
| Order Created: mandatory external number, duplicate rejected, Agent blocked until save completes | ✅ **verified live**: duplicate order number → `409`, and the Agent was confirmed still holding the active lead afterward since the failed save never released it |
| Refill: only 26–80 accepted, correct date computed, stored on the disposition record | ✅ unit tested end-to-end through the disposition save (parsing itself already covered in `packages/validation`); DB `CHECK` constraint added as defense-in-depth |
| Wrong Number → INVALID_NUMBER, closes assignment | ✅ unit tested |
| Other final dispositions → COMPLETED, closes assignment | ✅ unit tested (caught a real bug: `ALREADY_DISPENSED` was missing from the switch statement entirely until this test failed) |

## CDR (Phase 9)

Timestamp/endpoint parsing unit tests live in `packages/validation/src/
timezone.test.ts` (8 tests) and `cdr-endpoint.test.ts` (5 tests). Everything
else below was verified live against a real Postgres instance - a mocked
Prisma client cannot exercise the multi-leg grouping query, the raw-SQL
relevance join, or genuine duplicate-batch idempotency.

| Test | Status |
|---|---|
| Large file, thousands of unrelated numbers ignored (never promoted past staging) | ✅ verified live against the real 65,535-row `yeastar_cdr_sample.xls`: 65,526 rows staged, 0 promoted to `CdrRecord` (correct - this test DB's synthetic leads have no reason to share a phone number with the real sample's customers; the relevance join itself was proven correct separately by the synthetic fixture below, which *does* get promoted) |
| Multi-leg call sessions (IVR → transfer → agent, sharing one `cdrRecordId`) grouped into a single `CdrRecord`, not lost or double-counted | ✅ **caught a real bug live**: the original unique-constraint design silently discarded every leg after the first for the 8,561 of 35,891 real sessions (24%) that span 2-7 legs. Fixed (migration `20260723185141_cdr_staging_multi_leg_fix` + `cdr.processor.ts` rewrite); re-verified against the real file: all 65,526 valid rows now stage correctly across exactly 35,891 distinct sessions (cross-checked independently with a Python script over the raw file) |
| Yeastar "Time" column parses in both its real-world variants (with and without seconds) | ✅ **caught a real bug live**: re-running the real file surfaced 15,009/65,526 rows (23%) failing `CDR_PARSE_FAILED` because the regex assumed seconds were never present; the actual file mixes both. Fixed (optional seconds group in `parseCdrTimestamp`); re-verified against the real file: 0 `CDR_PARSE_FAILED` rows afterward |
| Inbound/outbound direction handled correctly, including picking the correct final agent endpoint for a multi-leg inbound call | ✅ verified live via the synthetic fixture (outbound → `MATCHED` against the calling agent; inbound-to-IVR → `NOT_MATCHED`); the multi-leg agent-endpoint-selection logic itself (last non-system leg for inbound) is exercised by the real file's grouping (no crashes/mismatches across 35,891 sessions) but has no real multi-leg *match* to assert against in this test DB - 🚧 a synthetic multi-leg inbound fixture with a real matching lead would close this gap |
| IVR/Queue excluded from Agent matching | ✅ verified live: a synthetic inbound call reaching only an IVR endpoint resolved to `NOT_MATCHED`, not `MATCHED`/`UNMAPPED_EXTENSION` |
| Unmapped extension flagged, not silently ignored or mis-matched | ✅ verified live: a synthetic call to an extension with no `ExtensionMapping` resolved to `UNMAPPED_EXTENSION` |
| Duplicate import is idempotent (re-processing the same call session in a second batch creates no duplicate `CdrRecord`/`CallMatch` rows) | ✅ **verified live**: seeded a lead+assignment, uploaded a one-row synthetic CDR file twice as two separate batches (same `cdrRecordId`, Yeastar's own call id, which is `@unique` on `CdrRecord` across the whole table) - after batch 1: 1 `CdrRecord`/1 `CallMatch`; after batch 2 (the P2002 catch path): still exactly 1 `CdrRecord`/1 `CallMatch`, match status unchanged (`MATCHED`) |
| Ambiguous matches stay `AMBIGUOUS`, never silently resolved | 🚧 implemented (`matchCdrRecordToLead` returns `AMBIGUOUS` when more than one open assignment matches the same agent) but not yet exercised by a live or unit test with two genuinely overlapping assignments |
| CDR timezone setting honored end-to-end (batch-configured source timezone, not assumed UTC/Cairo) | ✅ unit tested (`zonedWallTimeToUtc`/`parseCdrTimestamp` against both `Asia/Riyadh` and `Africa/Cairo`); live-verified indirectly (`sourceTimezone` defaults and is stored per-batch, confirmed in the match report response) |
| Upload/preview large-file performance | ✅ **caught a real bug live**: naive per-row `create()` took 2.5+ minutes against the real file; fixed with chunked `createMany` - now ~16s |
| Duplicate-batch-per-file rejected cleanly, not a raw 500 | ✅ unit tested (`imports.service.spec.ts`) + verified live |
| Extension auto-registration on first sighting (`upsert`, not requiring pre-registration) | ✅ unit tested (`extension-mappings.service.spec.ts`) + verified live |

A real fixture is already available for this:
`docs/samples/yeastar_cdr_sample.xls` — confirmed in this session to contain
the expected columns (`ID, Time, Call From, Call To, ...`) and IVR/Queue
labels (e.g. `IVR Duty Hours - AR_EN<6234>`) plus human agent labels
(e.g. `Abdelmagied Ali<7033>`), matching the direction-aware parsing rule.

## Dashboards and reports (Phase 10)

RBAC/scoping unit tests live in `apps/api/src/dashboards/dashboards.service.spec.ts`
(9 tests). Aggregation correctness was verified live against the real
accumulated data from every prior phase's testing in this session (55+
synthetic Agents/leads, real Cash/Insurance leads, real dispositions,
real CDR matches) - a mocked Prisma client cannot prove multi-table
aggregate correctness or genuine query-count-at-scale behavior.

| Test | Status |
|---|---|
| Agent blocked from every admin dashboard/report endpoint (403) | ✅ unit tested + **verified live** (`GET /dashboards/overview` with an Agent JWT → `403`) |
| Team Leader can view all teams; Shift Supervisor forced to their own regardless of a requested `teamId` | ✅ unit tested (assertion on the actual Prisma query args) + **verified live**: a dedicated Shift Supervisor/Agent/Team seeded for this check showed `activeAgents: 1` (their own team only) vs. the Team Leader's `68`, and passing a different `teamId` in the query string had no effect |
| An Agent can only ever see their own daily stats, never another Agent's (no `agentId` parameter exists on `/dashboards/me/daily` at all) | ✅ unit tested + verified live |
| Overview cards (§18.1): active/manual-break/idle-break Agent counts, total/completed/remaining leads + completion %, contacted leads, verified calls, leads with no verified call, orders created, Agents over break allowance | ✅ **verified live** against real accumulated data - cross-checked that `completedLeads + remainingLeads == totalUploadedLeads` and the completion percentage matched |
| Cash/Insurance summary (§18.2): totals, per-status breakdown, completion %, orders created, converted count, all ten exact disposition counters | ✅ **verified live**: `available + assigned + completed == total` held exactly against real data |
| Agent performance (§18.3): every listed field, computed for every Agent in scope with a fixed small number of aggregate queries (never one query per Agent) | ✅ **verified live** across 68 real synthetic Agents in a single request; spot-checked one Agent's `leadsTakenFromSearch`/`cashCount`/`currentActiveLeadId` against known Phase 6 test data |
| Converted Leads report (§18.4): masked phone/identity, unmasked customer name, agent, contact time, external order number, conversion timestamp, CDR verification, provider status, batch, partner | ✅ **verified live** against a real converted lead from Phase 7's testing |
| Converted Leads CSV export | ✅ verified live |
| Real-time overview via SSE (spec 19), correct `text/event-stream` headers, immediate first payload | ✅ verified live (`curl -N`, inspected response headers and first `data:` frame) |
| Dashboard counters cached for a short TTL, not recomputed on every request (spec 20) | ✅ implemented (in-memory, per-instance); 🚧 not yet load-tested for actual query-reduction under concurrent polling |
| Ambiguous CDR matches surfaced distinctly in reports, not silently merged into another status | 🚧 not yet exercised - no live data has an `AMBIGUOUS` `CallMatch` row in this session's test data |

Not yet built (see `docs/implementation/IMPLEMENTATION_STATUS.md`):

- Every check above was done via direct API calls (curl), not through a
  browser - Phase 11 built the Overview/Converted Leads pages that now
  call these endpoints from an actual UI (see below).
- CSV export for Overview/Leads Summary/Agent Performance (only Converted
  Leads has one).
- Monthly Attendance report endpoint; Audit Log listing endpoint.
- Shift-Supervisor "broader access" grant mechanism.

## Branding and UX (Phase 11)

Verified by actually running the app: `apps/api`/`apps/worker` live, `apps/web`
via `next dev`, driven with Playwright against the environment's pre-installed
Chromium (screenshotting every state, not just checking `tsc`/build exit
codes) - per CLAUDE.md's working-style note to use a UI change in a browser
before calling it done. No committed automated frontend test suite exists yet
(see gaps below) - this was scripted manual verification during development.

| Test | Status |
|---|---|
| Login page shows the Milaserv logo, brand colors, accessible labels | ✅ verified live (screenshot) |
| Login redirects to the correct home page per role (`/agent` for Agent, `/dashboard` for Team Leader/Shift Supervisor) | ✅ verified live for both roles |
| Authenticated shell: navy sidebar, logo top-left, white sidebar text, teal active-item pill, white cards, light-gray background, navy table headers | ✅ verified live (screenshot), matches spec 22 exactly |
| Full spec-section-3 navigation renders for both roles; unbuilt items show a clear disabled "Soon" state instead of a dead link | ✅ verified live |
| Sidebar highlights exactly one nav item, never two at once | ✅ **caught a real bug live**: `/dashboard/converted-leads` highlighted both "Overview" and "Converted Leads" (prefix-match bug in the active-item check); fixed with exact-path equality, re-verified |
| Responsive: mobile viewport (390×844) collapses the sidebar behind a hamburger button; the slide-over nav panel opens/closes correctly | ✅ verified live at both viewports |
| Keyboard navigation: Tab reaches interactive elements with a visible focus ring | ✅ verified live (screenshotted the first Tab stop on the login form) |
| Overview page: all cards render, correct semantic colors (green completed/verified/orders, amber "no verified call", red "over break allowance" when non-zero), 15s polling | ✅ verified live against real accumulated data |
| Converted Leads page: table renders, masked phone/identity, CDR verification badge, CSV export downloads a real file | ✅ **caught a real bug live**: the page was stuck on "Loading…" forever - the `perPage` query param, bound as a separate `@Query()` alongside a whitelisted DTO, made the *entire* request 400 under `forbidNonWhitelisted`. Fixed by moving `page`/`perPage` onto the DTO itself; re-verified live, renders correctly |
| Agent page: Start Session → Start Break → End Break → End Session, each transition reflected immediately in the UI | ✅ **caught a real bug live**: after the full cycle, the UI kept showing "Active" forever even though the backend genuinely had no open session (confirmed via direct `curl`) - `GET /sessions/current`'s `200` + empty-body response for "no session" wasn't handled by the frontend's JSON parsing (which only special-cased an explicit `204`). Fixed in the API client to treat any empty 2xx body as `null`; re-verified live, the full cycle now correctly ends on "No active session" |
| Agent page: My Daily Results cards render and update after each mutation | ✅ verified live |
| `next build` (production build) succeeds, all routes prerender | ✅ verified |

Not yet built:

- Automated frontend tests (component tests, a committed Playwright/E2E
  suite) - `apps/web` has no `test` script.
- Automated color-contrast checking (e.g. axe-core) - contrast was
  eyeballed against the spec's exact hex values only.
- SSE wired into the frontend (Overview page uses the 15s polling
  fallback only; the server-side SSE endpoint from Phase 10 is unused by
  the UI so far).

(The "14/16 Admin, 7/9 Agent nav items have no page" gap noted in earlier
versions of this table is now closed - see "Full navigation build-out"
below.)

## Full navigation build-out (post-MVP pass)

Closes the "no page yet" gap flagged at the end of Phase 11 for every
remaining spec §3 nav item. Full detail in
`docs/implementation/IMPLEMENTATION_STATUS.md`.

| Test | Location | Status |
|---|---|---|
| Admin-scoped Leads Search returns unmasked phone/identity, still permission-filtered | `apps/api/src/search/search.service.spec.ts` | ✅ |
| Monthly Attendance rollup shape and per-agent aggregation | `apps/api/src/sessions/attendance.service.spec.ts` | ✅ |
| Audit Log listing: filters, pagination | `apps/api/src/audit/audit.service.spec.ts` | ✅ |
| Settings: unknown key rejected, known key upserts and audit-logs before/after | `apps/api/src/settings/settings.service.spec.ts` | ✅ |
| Agent session/break history scoped to caller only (no `agentId` param exists to request another agent's) | manual, this session (route design mirrors `/dashboards/me/daily` from Phase 10) | ✅ verified live, 🚧 not yet an automated e2e test |
| All 15 Admin pages load with zero console/page errors, real Team Leader login | Playwright against pre-installed Chromium, this session | ✅ verified live (screenshotted every page) |
| All 7 new Agent pages load with zero console/page errors, real Agent login | same | ✅ verified live |
| Full interactive flow: Start Session → Generate Cash Lead → Call Customer → select disposition → Save → UI reflects "no active lead" afterward | Playwright, real clicks (not just backend curl), this session | ✅ verified live, zero console/page errors through the whole sequence |
| `POST /leads/generate` without an active session correctly 404s ("Start a session first") | manual, this session | ✅ confirmed as correct existing Phase 6 behavior, not a defect (initially worth double-checking since it looked like a new-page bug) |
| Login rate limit (10/60s) still enforced under repeated verification-script logins | manual, this session | ✅ confirmed working as designed - noted as an easy-to-hit trap for future verification scripts, not a product bug (see IMPLEMENTATION_STATUS.md for the workaround used) |
| `next build` (production build) succeeds, all 24 routes prerender | ✅ verified |
| Full API suite (81 tests across 12 suites) passing after all additions | ✅ verified |

Not yet built:

- Automated test coverage for the new pages themselves (same gap as Phase
  11 - verification was live/scripted Playwright, not a committed suite).
- "Lead Reports" and "Sessions & Breaks" are not yet visually distinct from
  their sibling nav items ("Leads Distributor" and "Live Shift Monitor"
  respectively) - flagged as a known, accepted duplication in
  `IMPLEMENTATION_STATUS.md`, not silently hidden.
- Settings page client-side value validation (e.g. enforcing
  `dashboardBreakAllowanceMinutes` is numeric before submit).

## Security, performance, and release readiness (Phase 12)

Full findings in `docs/architecture/SECURITY.md` (rewritten this phase
against the spec's 15-point checklist) and
`docs/implementation/IMPLEMENTATION_STATUS.md`. Summary:

| Test | Status |
|---|---|
| Security checklist (spec §23, all 15 items) reviewed against actual current code, not a stale snapshot | ✅ done - `docs/architecture/SECURITY.md`, each item SATISFIED/PARTIAL with file-level evidence |
| Rate limiting on import/CDR/extension-mapping endpoints | ✅ **caught a real gap live**: none of these had a route-specific limit beyond the generous global default; fixed (20-30/min added to each) |
| Upload MIME/size validation fails closed, not open | ✅ **caught a real gap live**: an empty allow-list silently accepted every file type; fixed. Multer's hardcoded 100MB ceiling disagreed with the configurable service-side limit; fixed to read the same env var |
| Database indexes exist for every field the spec calls out (active-owner/status/type/batch, plus whatever Phase 10's dashboards actually query) | ✅ **caught 4 real gaps live**: `WorkSession(teamId,status)`, `LeadAssignment(teamId)`, `LeadOrderReference(createdById)`, `User(role,teamId)` were all missing, causing sequential scans on queries polled every 15s. Fixed via migration `20260723194146_phase12_dashboard_index_review`, confirmed live via `\di` |
| Generate Lead concurrency still holds after the index migration | ✅ **verified live**: 9 concurrent requests, fresh synthetic Agents, 9/9 succeeded with 9 distinct leads, zero duplicates |
| Data-hygiene incident during the above: two leftover `Lead` rows had a dangling `LeadAssignment.activeLeadMarker` after being reset to `AVAILABLE` by an earlier cleanup script that skipped releasing the assignment | ✅ **root-caused rigorously** (isolated Prisma-only reproduction bypassing NestJS/HTTP; cross-checked against 5 truly-concurrent raw `psql` sessions proving Postgres/SKIP LOCKED itself was never the problem) and repaired. The actual finding is reassuring, not alarming: every claim attempt against the two poisoned rows correctly got a clean `409` from the unique-constraint safety net - no double-assignment ever occurred |
| Docker build | 🚧 `docker compose config` (syntax/env validation) passes; `docker info` confirms the daemon cannot start in this sandbox (a capability/ulimit restriction, not just registry access as earlier phases assumed) - `docker compose build`/`up` remain unverified here |
| Full monorepo build (api/worker/web) | ✅ verified clean end-to-end this phase |
| UAT / staging deployment / backup-restore drill | 🚧 not run - these require a real staging deployment and a human tester, which this session cannot provide. `docs/release/UAT.md`/`ROLLBACK.md` remain accurate templates, unchanged |
| Load testing at the spec's full "200+ users" target | 🚧 not performed - only smoke-tested at 9-55 concurrent requests (this session's practical ceiling for interactively seeding/cleaning up synthetic accounts) |
| Team-scoping for imports/CDR/extension-mappings | 🚧 **documented gap, not fixed** - any Team Leader/Shift Supervisor can view any import batch/CDR report regardless of team, since `LeadImportBatch`/`CdrImport` have no `teamId` in the schema. Flagged as a product decision, not silently left unaddressed |

## Idle break (Phase 5)

| Test | Location | Status |
|---|---|---|
| Exact threshold behavior: last activity 10:00, threshold detected 10:05, recorded break start 10:00, resumes 10:12, duration 12 minutes | `apps/api/src/devices/devices.service.spec.ts` | ✅ unit tested with the literal spec example, and live-verified end-to-end with real timestamps (see `docs/implementation/IMPLEMENTATION_STATUS.md`) |
| Idle break start time is the last-activity timestamp, not the detection time | same | ✅ |
| Idle detection does not fire while on an explicit manual break | same | ✅ |
| Repeated "still idle" heartbeats do not open a second idle break | same | ✅ |
| Device token cannot authenticate a normal user endpoint | manual, this session (`GET /users` with a device token → `401`) | ✅ |
| Device registration refuses to hijack another user's active device | `devices.service.spec.ts` | ✅ |
| The .NET companion itself (Win32 idle detection, real heartbeat loop against a live API) | — | 🚧 **not verified anywhere** - no Windows/.NET SDK available in this sandbox |

## Running what exists today

```bash
pnpm --filter @milaserv/validation test
pnpm --filter @milaserv/api test
```

`pnpm test` (repo-wide) runs both once every package has a `test` script;
currently `packages/database`, `packages/contracts`, `packages/ui`,
`apps/web`, and `apps/worker` have no tests yet.
