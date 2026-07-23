# Security

## Authentication (implemented)

- Passwords hashed with Argon2id (`argon2` package defaults).
- Access tokens: short-lived JWT (default 15 minutes), HS256, signed with
  `JWT_ACCESS_SECRET`, sent as a Bearer token — never stored in a cookie.
- Refresh tokens: opaque random 48-byte tokens, stored **hashed** (SHA-256) in
  `RefreshToken`, delivered as an `httpOnly`, `sameSite=lax` cookie scoped to
  `/auth`, `secure` in production. Rotated on every refresh (old token
  revoked, new one issued) so a leaked-but-unused refresh token cannot be
  replayed after its first legitimate use.
- Account lockout: configurable failed-attempt threshold
  (`AUTH_LOCKOUT_MAX_ATTEMPTS`, default 5) within a window, after which the
  account is locked for `AUTH_LOCKOUT_DURATION_MINUTES`. Verified by
  `apps/api/src/auth/auth.service.spec.ts`.
- Rate limiting: global Nest Throttler (120 req/min) plus a stricter
  per-route limit on `POST /auth/login` (10 req/min) — confirmed live in this
  session (11th login attempt in a minute returns 429).
- Every authentication event (success, failure, lockout, password change) is
  written to `AuditLog`.
- Unknown-email and wrong-password both return the same generic
  "Invalid email or password" message — the API never reveals whether an
  account exists.

## Authorization (implemented for what exists so far)

- `JwtAuthGuard` is registered as a **global** `APP_GUARD` — every route
  requires a valid access token unless explicitly annotated `@Public()`.
  (Caught a real bug in this session: `/health` was unreachable until
  `@Public()` was added — this is exactly the failure mode the global-guard
  design is meant to make loud instead of silent.)
- `RolesGuard` + `@Roles(...)` enforce role membership on top of
  authentication. Verified live: an `AGENT` user receives `403` on
  `GET /users`.
- `Shift Supervisor` scope is enforced in the service layer (not just the
  guard) — `UsersService`/`TeamsService`/`ShiftsService` filter by
  `actor.teamId` for non-Team-Leader roles, and throw `ForbiddenException` if
  a supervisor requests a resource outside their team, even if they guess the
  id.
- Planned but not yet built: `TeamScopeGuard` is written
  (`common/guards/team-scope.guard.ts`) but not yet wired into a controller —
  route-param-based team scoping lands with the Sessions/Breaks and Lead
  modules in later phases.

## What is intentionally deferred

- MFA: design is compatible (JWT-based auth, separate login step could add a
  challenge) but not implemented in Phase 1.
- IDOR-safe public ids (vs raw UUIDs): UUIDs are used as primary keys
  throughout, which are not enumerable — considered adequate for this phase
  rather than adding a separate public-id layer.

## Upload security (design, not yet implemented — Phase 2)

- MIME type and extension allow-list (`UPLOAD_ALLOWED_MIME_TYPES`).
- Size limit (`UPLOAD_MAX_FILE_SIZE_MB`).
- Files stored outside the web root, referenced by id, never served directly.
- SHA-256 checksum stored (`LeadImportFile.checksumSha256`) to detect
  re-uploads of the same file for idempotency reporting.

## Device/companion security (design, not yet implemented — Phase 5)

- Device registration requires a valid user access token once, in exchange
  for a long-lived device token used only for the heartbeat endpoint.
- Heartbeat payload is limited by contract to: device id, last-activity
  timestamp, idle duration, companion version. No key contents, screenshots,
  screen content, or file contents are ever collected — enforced by the
  companion's own data model (`HeartbeatRequest` in
  `apps/activity-agent/src/HeartbeatModels.cs` has no field capable of
  carrying any of that).

## Data exposure rules (enforced in Phase 8, Leads Search)

- General Agent Leads Search must never return medication names, quantities,
  pricing, or insurance financial references — this must be verified against
  the actual API response payload, not just hidden in the UI, per
  `docs/specifications/MILASERV_CRM360_MVP.md` §15.
- Phone and national ID are masked for Agents (`packages/validation`'s
  `maskPhone` keeps only the first 5 and last 2 digits).

## Secrets and logging

- All secrets come from environment variables (`.env`, never committed —
  `.gitignore` excludes it); `.env.example` documents every variable with
  placeholder values.
- Nothing in the codebase logs passwords, tokens, or raw medical/insurance
  data at this point; this must be re-checked as the import/CDR/dispositions
  modules are added (tracked in `docs/testing/TEST_PLAN.md` security review
  checklist for Phase 12).
