# Security

> Last reviewed: 2026-07-23, Phase 12, against the 15-point checklist in
> `docs/specifications/MILASERV_CRM360_MVP.md` §23. Earlier phases wrote this
> document from a Phase-1-only view; this rewrite reflects the whole
> codebase after Phases 1-11.

## Checklist verdicts (spec §23)

1. **Backend authorization for every endpoint/action - SATISFIED.**
   `JwtAuthGuard` and `RolesGuard` are global `APP_GUARD`s
   (`apps/api/src/app.module.ts`); every controller applies `@Roles(...)`
   or is explicitly `@Public()`. Public routes are limited to `GET /health`,
   `POST /auth/login`, and `POST /auth/refresh` - the browser-based activity
   tracker's `GET /activity/status`/`POST /activity/heartbeat` use the
   Agent's normal JWT, not a separate public/device auth path. `role`/`teamId` are
   re-read from the database on every request (`JwtStrategy.validate` →
   `AuthService.validateUserById`), not trusted from JWT claims - a stale or
   tampered token can't preserve access after a role change or
   deactivation.
2. **Mask identity and phone by role - SATISFIED.** `SearchService.search`
   and `DashboardsService`'s Converted Leads export return
   `maskedPhone`/`maskedIdentity` only (`maskPhone`/`maskIdentifier` in
   `packages/validation/src/phone.ts`). Full identity is unmasked only for
   TEAM_LEADER/SHIFT_SUPERVISOR in the CDR match report (see #15).
3. **Hide medication data from general Agent Leads Search - SATISFIED.**
   `SearchService`'s Prisma `select` explicitly lists fields and never
   includes `medicationItems`/pricing; locked in by a unit test asserting
   the exact key set of a search result. Medication data is only ever
   returned via `LeadsService.getActiveLead` (an Agent's own active lead).
4/5. **Validate uploads / restrict file type & size - PARTIAL.**
   `ImportsService.uploadFile` checks `mimetype` against
   `UPLOAD_ALLOWED_MIME_TYPES` and `size` against `UPLOAD_MAX_FILE_SIZE_MB`.
   Fixed this phase: the MIME check now fails closed (an empty/misconfigured
   allow-list rejects every upload instead of silently allowing everything),
   and Multer's own `FileInterceptor` limit now reads the same
   `UPLOAD_MAX_FILE_SIZE_MB` env var instead of an independent hardcoded
   100MB ceiling that could silently let more through than the configured
   limit implied. Still true: the MIME check is the client-supplied
   `Content-Type` header, never verified via magic-byte/content sniffing,
   and file *content* is only actually exercised at `generatePreview`
   (parsed as a spreadsheet), after the file is already accepted, stored,
   and checksummed. **No antivirus/malware scanning exists.**
6. **Secure object storage - PARTIAL.** Files are stored on local disk with
   a randomized stored name and are never served via a static-file route
   (no `express.static`/`ServeStaticModule`) - CSV/report downloads are
   streamed by the API itself, not by path. This is local filesystem
   storage, not a true object store (S3/GCS with private ACLs,
   encryption-at-rest, signed URLs) - acceptable for the MVP/pilot scale,
   flagged as a gap before scaling storage beyond a single host.
7. **Rate-limit search and import endpoints - SATISFIED.** Global
   `ThrottlerModule` (120/min) applies everywhere; `POST /auth/login`
   (10/min) and `GET /leads-search` (30/min) had route-specific limits from
   earlier phases. **Added this phase**: `POST /imports/files`,
   `POST /imports/batches`, `POST /imports/batches/:id/preview`,
   `POST /imports/batches/:id/confirm` (20/min each - heavier
   upload/processing-trigger operations), `GET /imports/batches/:id/cdr-report`
   (30/min - returns unmasked customer data per row) and
   `PATCH /extension-mappings/:extension` (30/min) - none of these had a
   route-specific limit before this review.
8. **Record actor/timestamp/before-after for sensitive changes - SATISFIED,
   mostly.** `AuditService.record` writes `actorId`, `action`,
   `entityType/Id`, `before`, `after`, `createdAt`. Covered: auth
   (login/logout/lockout/password-change), sessions (start/end/break/
   force-close), leads (generate/take), dispositions, imports (upload/
   batch-create/confirm), extension-mappings (assign, with explicit
   before/after), users/teams/shifts, devices. Gap: intermediate batch
   status transitions (`VALIDATING`→`PREVIEW_READY`) aren't separately
   audited with before/after the way `assignUser` is - a good pattern to
   extend, not a security hole (the transitions are still fully
   reconstructable from `LeadImportBatch` timestamps).
9. **Prevent horizontal privilege escalation - PARTIAL.** Strong scoping
   exists in most services: `SessionsService.forceCloseSession`,
   `UsersService`/`TeamsService`/`ShiftsService`, and
   `DashboardsService.resolveTeamScope` (added Phase 10, verified live that
   a Shift Supervisor's requested `teamId` is silently overridden to their
   own) all enforce team boundaries in the service layer.
   **`TeamScopeGuard` (`common/guards/team-scope.guard.ts`) is still written
   but never wired into any controller** - scoping is ad hoc per-service
   instead of guard-enforced, which is functionally equivalent today but
   has no backstop if a new controller omits the check. `ImportsService`,
   `CdrService`, and `ExtensionMappingsService` have **no team scoping at
   all** - any TEAM_LEADER or SHIFT_SUPERVISOR can view/confirm/export any
   import batch or CDR match report regardless of team. This is a real gap,
   not obviously a bug: `LeadImportBatch`/`CdrImport` have no `teamId` in
   the data model (imports are a shared, not per-team, operation), so
   "scoping" them would require a data-model decision (e.g. deriving scope
   from the teams of agents assigned leads within the batch) that hasn't
   been made - flagged for a product decision before broad Shift Supervisor
   rollout, not silently assumed fine.
10. **Prevent IDOR - PARTIAL.** Good patterns:
    `DispositionsService.getOwnedActiveAssignment` requires
    `activeAgentMarker === actor.id`; `LeadsService.takeLead` checks
    `UserLeadPermission` before claiming; `UsersService.removeLeadPermission`
    verifies ownership before deleting. Gap: `ImportsController`'s
    `getBatch`/`listErrors`/`exportErrorsCsv`/`generatePreview`/
    `confirmBatch` and `CdrController.getReport` take an `:id` and only
    check role, never batch ownership/team - same root cause as #9.
11. **Raw DB IDs as public IDs - NOT A GAP.** Every model uses
    `String @id @default(uuid())` - non-sequential, non-enumerable. This is
    a deliberate, consistently-applied project convention (documented
    here since Phase 1), not a competing "safe public id" scheme being
    bypassed.
12. **Use HTTPS - SATISFIED (app does its part; TLS termination is
    infra).** `helmet()` is applied in `main.ts`, setting
    `Strict-Transport-Security` and other security headers by default.
    Actual TLS termination is a deployment/reverse-proxy concern outside
    this repo.
13. **Secure activity-heartbeat authentication - SATISFIED, architecture
    changed.** The browser-based tracker (superseding the Windows-companion
    design, CLAUDE.md rule 3) authenticates `POST /activity/heartbeat` with
    the Agent's own JWT under the standard `RolesGuard`/`@Roles(AGENT)` -
    there is no separate device-token flow to secure. Heartbeat payload is
    contract-limited to last-activity timestamp and idle duration only; no
    keystrokes, screenshots, URLs, or window/tab titles are ever collected.
    An Admin per-Agent `activityTrackingEnabled` flag can disable tracking
    entirely for a given user.
14. **Do not log medical data unnecessarily - SATISFIED.** No
    `Logger`/`console.log` calls exist in `apps/api/src` except the
    startup banner; no request-body-logging interceptor exists. Audit
    records for dispositions store only `{ disposition, newStatus }`, never
    medication names/notes/pricing.
15. **Do not expose raw CDR data beyond authorized users - SATISFIED, with
    a caveat.** `CdrController` is gated to TEAM_LEADER/SHIFT_SUPERVISOR;
    Agents cannot reach it. `CdrService.getMatchReport` does return
    unmasked customer phone/name, appropriate for these roles, but (per #9)
    is not further scoped to a Shift Supervisor's own team - any Shift
    Supervisor can pull the unmasked CDR report for any batch.

## Authentication (unchanged from Phase 1, re-confirmed)

- Passwords hashed with Argon2id.
- Access tokens: short-lived JWT (15 min default), Bearer only, never in a
  cookie. Refresh tokens: opaque, stored hashed (SHA-256), httpOnly cookie
  scoped to `/auth`, rotated on every use.
- Account lockout after a configurable failed-attempt threshold.
- Unknown-email and wrong-password return the same generic message.

## Fixed this phase (Phase 12 security review)

1. Rate limits added to import write endpoints, the CDR report, and
   extension-mapping assignment (see checklist item 7 above).
2. Upload MIME allow-list now fails closed instead of fail-open on an empty
   list.
3. Multer's hardcoded upload size ceiling now tracks the configurable
   `UPLOAD_MAX_FILE_SIZE_MB` instead of silently disagreeing with it.
4. **A genuine test-data hygiene bug, found via a concurrency regression
   smoke test, not a real app bug**: two `Lead` rows from earlier live
   testing in this session had been reset to `status = AVAILABLE` directly
   via script without also releasing their `LeadAssignment.activeLeadMarker`,
   leaving a dangling "active" assignment on a lead the system otherwise
   considered free. This is not an application defect - the atomic
   claim path (`SELECT ... FOR UPDATE SKIP LOCKED` + the
   `activeLeadMarker`/`activeAgentMarker` unique constraints) worked
   exactly as designed and correctly rejected every attempt to claim
   those two poisoned rows with a clean `409`, rather than silently
   double-assigning them - proving the defense-in-depth constraint layer
   earns its keep. Root-caused by reproducing the exact failure with an
   isolated Prisma-only script (bypassing NestJS/HTTP entirely) and cross-
   checking against 5 truly concurrent raw `psql` sessions, which
   confirmed Postgres and Prisma both behave correctly; the two affected
   rows were identified via direct SQL (`LeadAssignment.active_lead_marker
   IS NOT NULL` joined to a `Lead.status` that implies no active claim)
   and repaired by properly releasing them. Documented here as a reminder:
   **never reset `Lead.status` directly without also releasing the
   corresponding `LeadAssignment`** - always go through the application's
   release path (or release both fields together) when hand-fixing test
   data.

## What is intentionally deferred

- MFA: design-compatible, not implemented.
- A shared (Redis-backed) cache for dashboard counters - the current
  in-memory cache is correct but per-process only; fine for a single API
  replica, a gap before horizontal scaling.
- Object storage migration (local disk → S3/GCS) - fine for MVP/pilot
  scale, a gap before a larger production rollout.
- Team-scoping `ImportsService`/`CdrService`/`ExtensionMappingsService`
  (checklist items 9/10/15) - needs a product decision on what "team-scoped
  import visibility" even means before implementing, since imports aren't
  inherently per-team the way sessions/leads are.
