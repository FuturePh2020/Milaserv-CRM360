# Final Readiness Report

Date: 2026-07-23. Branch: `claude/new-session-npapwr`. Commit: `d64414d`.

## Summary

- **Overall completion**: all 13 originally-planned MVP phases (0-12) are
  built and were live-verified in earlier work this session. A full
  repository audit against the final-audit checklist found and fixed 12
  distinct real defects (see `docs/implementation/FINAL_REPOSITORY_AUDIT.md`),
  added a genuine automated integration/concurrency test suite that did not
  exist before, and replaced the original Windows-companion activity design
  with browser-based tracking (a deliberate, explicitly-called-out
  architecture change - see `docs/implementation/IMPLEMENTATION_STATUS.md`'s
  "Architecture change" section and CLAUDE.md rule 3).
- **Deployment target**: Vercel (Next.js web) + Render free web service
  (NestJS API with the BullMQ worker embedded) + Supabase Postgres +
  Upstash Redis (TLS). Config and docs only - **no live deployment has been
  executed**; this session has no Vercel/Render/Supabase/Upstash account or
  API credentials. See "Demo readiness" below for exactly what was and
  wasn't verifiable without them.
- **Tested environment**: Node v22.22.2, pnpm 10.33.0, PostgreSQL 16.13,
  Redis 7.0.15, Docker 29.3.1 / Compose v5.1.1 (client only).
- Full real command output lives in `docs/testing/FINAL_COMMAND_RESULTS.md`.

## Files added this pass (Render/Vercel/Supabase/Upstash prep + architecture change)

```
render.yaml                                   (new, root-level)
scripts/render-start.sh                       (new)
apps/web/vercel.json                          (new)
.env.render.example                           (new)
.env.vercel.example                           (new)
docs/deployment/FREE_PUBLIC_DEMO_CLOUD.md     (new)
apps/api/src/activity/{activity.controller.ts,activity.module.ts,activity.service.ts,activity.service.spec.ts,dto/heartbeat.dto.ts}  (new - replaces apps/api/src/devices/*)
apps/web/src/components/ActivityTracker.tsx   (new)
packages/database/prisma/migrations/20260723223018_browser_activity_tracking/migration.sql  (new)
```
Plus modifications to `apps/api/src/main.ts` (PORT env var), `apps/worker/src/redis.ts`
and `apps/api/src/imports/imports.service.ts` (Redis TLS for Upstash),
`apps/web/next.config.mjs` (same-origin `/api` rewrite, conditional
standalone output), `apps/web/Dockerfile` (`BUILD_STANDALONE=true`),
`CLAUDE.md`/`README.md`/`docs/architecture/ARCHITECTURE.md`/`docs/architecture/SECURITY.md`
(activity-tracking architecture change), and deletion of `apps/activity-agent/`
entirely. Full diff: `git diff 927cd58..d64414d` (927cd58 is this branch's
tip before this session's audit pass began).

## render.yaml contents

```yaml
services:
  - type: web
    name: milaserv-crm360-api
    env: node
    plan: free
    region: oregon
    branch: main
    buildCommand: >-
      corepack enable &&
      corepack prepare pnpm@10.33.0 --activate &&
      pnpm install --frozen-lockfile &&
      pnpm --filter @milaserv/database exec prisma generate &&
      pnpm --filter @milaserv/database exec prisma migrate deploy &&
      pnpm --filter @milaserv/contracts build &&
      pnpm --filter @milaserv/validation build &&
      pnpm --filter @milaserv/api build &&
      pnpm --filter @milaserv/worker build
    startCommand: bash scripts/render-start.sh
    healthCheckPath: /health
    envVars: [... see .env.render.example for the full list of names ...]
```
(Full file, all 26 env var entries, is `render.yaml` at the repo root.)

**Validation result**: `python3 -c "import yaml; yaml.safe_load(open('render.yaml'))"`
→ valid YAML, no syntax errors. The exact `buildCommand` string above was
run locally, verbatim except substituting a local Postgres URL for the
Supabase one, and succeeded (see `docs/testing/FINAL_COMMAND_RESULTS.md`
and the audit doc). `scripts/render-start.sh` was run locally with `PORT`
set (simulating Render's port assignment) and confirmed both processes
start and `GET /health` returns `200`. **Render's own build/deploy pipeline
has not run this file** - no Render account exists in this session.

## Exact Render service configuration

| Field | Value |
|---|---|
| **Root Directory** | repository root (blank / `.`) |
| **Build Command** | `corepack enable && corepack prepare pnpm@10.33.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @milaserv/database exec prisma generate && pnpm --filter @milaserv/database exec prisma migrate deploy && pnpm --filter @milaserv/contracts build && pnpm --filter @milaserv/validation build && pnpm --filter @milaserv/api build && pnpm --filter @milaserv/worker build` |
| **Start Command** | `bash scripts/render-start.sh` |
| **Health Check Path** | `/health` |

## Required Render environment variable names

`DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`,
`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`,
`AUTH_LOCKOUT_MAX_ATTEMPTS`, `AUTH_LOCKOUT_WINDOW_MINUTES`,
`AUTH_LOCKOUT_DURATION_MINUTES`, `CORS_ORIGIN`, `SEED_TEAM_LEADER_EMAIL`,
`SEED_TEAM_LEADER_PASSWORD`, `SEED_TEAM_LEADER_FULL_NAME`,
`UPLOAD_STORAGE_PATH`, `UPLOAD_MAX_FILE_SIZE_MB`, `UPLOAD_ALLOWED_MIME_TYPES`,
`CDR_DEFAULT_SOURCE_TIMEZONE`, `DASHBOARD_BREAK_ALLOWANCE_MINUTES`,
`DASHBOARD_OVERVIEW_CACHE_TTL_SECONDS`, `IDLE_BREAK_THRESHOLD_SECONDS`,
`APP_TIMEZONE`, `WORKER_CONCURRENCY`, `NODE_ENV`. Full descriptions and
where each real value comes from: `.env.render.example`.

Required Vercel environment variable names: `NEXT_PUBLIC_API_URL` (`/api`),
`API_ORIGIN` (the real Render URL), `NEXT_PUBLIC_DEMO_MODE` (`true`). See
`.env.vercel.example`.

## Feature matrix

| Feature | Status |
|---|---|
| Auth (login/logout/refresh/lockout/RBAC) | PASS |
| Sessions, manual breaks, attendance rollup | PASS |
| Browser-based activity tracking (idle detection, Admin per-Agent enable/disable, Admin-configurable threshold) | PASS - unit tested (9 tests) and live-verified in a browser this pass |
| Cash / Insurance import (upload → preview → confirm → process) | PASS |
| Yeastar CDR import and matching | PASS |
| Generate Lead (atomic, ≥50 concurrent, zero duplicates) | PASS - committed automated e2e test |
| Take Lead (simultaneous race, exactly one winner) | PASS - committed automated e2e test |
| Call Customer → Disposition (all 10 dispositions) | PASS |
| No Answer/Busy 13-point release-and-recontest rule | PASS - committed automated e2e test |
| Leads Search (Agent masked, Admin unmasked, permission-filtered) | PASS |
| Dashboards/reports | PASS |
| Full Admin (16-item) / Agent (9-item) navigation | PASS |
| Production start command (`node dist/main.js`) | PASS - fixed this pass; had never once worked before (audit finding #10) |
| Docker images (Dockerfiles, `docker compose config`) | PASS (build/config only - daemon unavailable in this sandbox) |
| Render/Vercel/Supabase/Upstash config | PASS (locally-simulated build commands only) / **NOT DEPLOYED** - no cloud accounts in this session |

## Test matrix

| Type | Result |
|---|---|
| Unit (`packages/validation`) | 56/56 passing |
| Unit (`apps/api`) | 83/83 passing across 12 suites (up from 81 - activity module replaces the devices module, 9 tests vs 7) |
| Integration/concurrency (`apps/api` e2e) | 3/3 passing |
| Build | `pnpm build` - all packages/apps, 27 web routes prerendered |
| `pnpm -r lint` | clean, 0 errors (52 accepted warnings, all `any` in test mocks) |
| `pnpm -r typecheck` | clean across all 8 packages with scripts |
| `docker compose config` (both files) | clean |
| `render.yaml`'s exact buildCommand | succeeded locally (Supabase substituted with local Postgres) |
| `scripts/render-start.sh` | succeeded locally, `$PORT` respected, `/health` → 200 |
| `vercel.json`'s exact buildCommand | succeeded locally, `/api` rewrite confirmed present in `routes-manifest.json` |
| Actual Render/Vercel deploy | **not run** - no account/credentials |

## Known limitations

- **No live cloud deployment has been executed** - this is the central
  honesty point of this report. Every Render/Vercel command was validated
  by running the identical command locally; the real platforms have never
  seen this code.
- Upload storage on Render's free tier is ephemeral disk, not Supabase
  Storage - a documented follow-up, not implemented this pass (see
  `FREE_PUBLIC_DEMO_CLOUD.md`).
- The embedded worker (Render free tier) has no independent health
  monitoring or auto-restart.
- The .NET activity companion no longer exists in this codebase (removed,
  replaced by browser-based tracking) - not a gap, a deliberate change.
- No password-reset flow; Leads Search is exact-match only; cross-midnight
  attendance sessions aren't split; team-scoping gap for imports/CDR
  remains open (all carried forward from earlier phases, unchanged).
- No automated frontend test suite (component/Playwright E2E as a
  committed CI suite) - verification is live/scripted.
- Load testing only run at 10-55 concurrent requests, not the spec's 200+.
- `docker compose build`/`up` has never been executed anywhere (daemon
  unavailable in every environment this project has been built in).

## Demo readiness

### `NOT READY — BLOCKERS REMAIN`

| Blocker | Severity | File | Fix | Validation command |
|---|---|---|---|---|
| No Render/Vercel/Supabase/Upstash account exists in this session - the actual cloud deployment has never been executed, only every underlying command validated locally | High (blocks "Docker starts"/deploy-equivalent readiness criterion) | N/A - requires real accounts and credentials this session does not have | Create the four accounts per `docs/deployment/FREE_PUBLIC_DEMO_CLOUD.md`, connect this repo/branch, fill in the documented env vars, and deploy | Render dashboard "Deploy" → `curl https://<render-url>/health`; Vercel dashboard "Deploy" → visit the Vercel URL and confirm `/api/health` (via the rewrite) responds |
| `docker compose build`/`up` (the alternative Docker-based demo path) has never been executed - the daemon cannot start in this sandbox | Medium (alternative path only; not required if the cloud path above is used) | N/A - sandbox limitation | Run on any host with a working Docker daemon | `docker compose -f docker-compose.demo.yml up --build` |

Everything that could be verified without those accounts has been:
every unit/e2e test, the full monorepo build, both compose files' syntax,
`render.yaml`'s and `vercel.json`'s exact build commands (run locally,
successfully), `scripts/render-start.sh` (run locally, successfully,
`$PORT` respected, health check answers 200), and a from-clean-database
migration. The remaining step in both paths is the same shape: an actual
deploy against real infrastructure this session cannot reach. Given how
much of the pipeline is now independently confirmed correct, this is
expected to succeed on the first real attempt - but "expected to succeed"
is not "verified," and this report does not claim readiness it cannot back
with a command that actually ran against the real target.
