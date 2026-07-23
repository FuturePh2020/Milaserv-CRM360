# Implementation Status

Last updated: 2026-07-23, end of Phase 0/Phase 1 (initial pass).

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

## Phases 2–12

**Not started.** Import framework, Cash/Insurance parsers, sessions/breaks,
activity companion wiring end-to-end, lead distribution, dispositions,
search/Take Lead, CDR matching, dashboards, branding polish, and the release
checklist are all outstanding. The Prisma schema for all of these already
exists (Phase 0), but no application code reads or writes most of those
tables yet.

The BullMQ worker (`apps/worker`) has queue wiring and a placeholder
`lead-import` processor only — no real parsing logic.

The .NET activity companion (`apps/activity-agent`) has idle-detection,
device-registration, and heartbeat-loop source code, but **has not been
compiled or run** — there is no .NET SDK or Windows environment in this
sandbox. Treat it as unverified until built on Windows.

## Quality gates, as of this update

```
pnpm --filter @milaserv/validation test    # 18/18 passing
pnpm --filter @milaserv/api test           # 5/5 passing (auth.service.spec.ts)
cd packages/database && prisma validate    # valid
cd apps/api && tsc --noEmit                # clean
```

`pnpm lint` and a full `pnpm build` across every package have not been run
yet in this session — do that before considering Phase 1 fully closed.
