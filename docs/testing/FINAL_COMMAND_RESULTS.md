# Final Command Results

Date: 2026-07-23. Every command below was actually run in this pass, against
this exact repository state, in the environment described in
`docs/implementation/FINAL_REPOSITORY_AUDIT.md`. No result here is asserted
without having produced the output shown (or summarized where very long).

Environment: Node v22.22.2, pnpm 10.33.0, PostgreSQL 16.13, Redis 7.0.15,
Docker 29.3.1 / Compose v5.1.1 (client only - daemon cannot start in this
sandbox, see below).

## Dependency install

```
$ pnpm install
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.6s
```
Exit 0.

## Prisma generate

```
$ cd packages/database && npx dotenv -e ../../.env -- npx prisma generate
✔ Generated Prisma Client (v5.22.0) to ./generated/client in 722ms
```
Exit 0.

## Lint (every package)

```
$ pnpm -r lint
packages/ui lint: Done
packages/validation lint: Done
packages/database lint: Done
apps/web lint: ✔ No ESLint warnings or errors
apps/web lint: Done
apps/worker lint: Done
apps/api lint: ✖ 56 problems (0 errors, 56 warnings)
apps/api lint: Done
```
Exit 0 for every package. The 56 warnings are all `@typescript-eslint/no-explicit-any`
in Jest test files mocking the Prisma client (a standard, accepted pattern -
see `FINAL_REPOSITORY_AUDIT.md`'s grep-sweep section) plus 2 narrow uses in
`settings.service.ts` for a Prisma `Json` column. Zero errors, zero warnings
outside those two categories.

**Fix performed to get here**: `eslint` could not run *at all* before this
pass for `apps/api`/`apps/worker` (no dependency declared, resolved an
incompatible v10 install with no config), and `packages/*` had no `lint`
script. Added pinned `eslint`/`@typescript-eslint/*` devDependencies and a
`.eslintrc.json` per package. Once it could run, it immediately caught and
this pass fixed: a dead duplicate branch in `normalizeSaudiPhone`
(`packages/validation/src/phone.ts`), two floating `bootstrap()` promises
(`apps/api`/`apps/worker` `main.ts`), and an unused import.

## Typecheck (every package)

```
$ pnpm -r typecheck
packages/contracts typecheck: Done
packages/validation typecheck: Done
packages/database typecheck: Done
apps/worker typecheck: Done
apps/api typecheck: Done
packages/ui typecheck: Done
apps/web typecheck: Done
```
Exit 0 for every package.

**Fix performed to get here**: `packages/ui/src/tokens.ts` imports
`@milaserv/contracts`, but `packages/ui/package.json` never declared it as a
dependency - it only ever resolved by accident through `apps/web`'s Next.js
build pulling both packages into one webpack graph. Running `packages/ui`'s
own `typecheck` script in isolation (its dedicated `tsconfig`/`node_modules`,
not `apps/web`'s) failed with `Cannot find module '@milaserv/contracts'`
until the dependency was declared explicitly and `pnpm install` re-linked
the workspace symlink.

## Unit tests

```
$ pnpm -r test
packages/validation test: Test Files  9 passed (9)
packages/validation test:      Tests  56 passed (56)
apps/worker test: No tests found, exiting with code 0
apps/api test: Test Suites: 12 passed, 12 total
apps/api test: Tests:       81 passed, 81 total
```
Exit 0 for every package. `apps/worker` has no unit test suite - its
processors are integration-verified live against real files instead (see
Phase 2/3/9 in `IMPLEMENTATION_STATUS.md`), which is an accurate limitation,
not a script failure.

## Integration / concurrency tests (e2e)

```
$ pnpm --filter @milaserv/api test:e2e
PASS test/take-lead-race.e2e-spec.ts
PASS test/generate-lead-concurrency.e2e-spec.ts
PASS test/no-answer-busy.e2e-spec.ts

Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
Time:        8.138 s
```
Exit 0. This suite did not exist before this pass (`test:e2e` referenced a
`jest-e2e.json` that was never created - see finding #6 in
`FINAL_REPOSITORY_AUDIT.md`). All three tests run against a real Postgres
with genuine concurrent HTTP requests via supertest, and self-clean every
row they create (verified directly against the database after each run -
zero leftover `e2e-*` rows).

**Two real infra bugs surfaced and fixed while getting these green**:
1. Supertest's default lazy-bind-on-first-request pattern produced ~40-84%
   `ECONNRESET` failures under 50-way concurrent fan-out; fixed by calling
   `app.listen(0)` before firing requests (an already-listening server, as
   the equivalent Phase 6 live test actually used, is not flaky the same way).
2. The live `.env`'s `DATABASE_URL` never had the `connection_limit=60`
   suffix that `.env.example` already documents - Prisma's real default pool
   (9 connections) could not serve 50 concurrent transactions, confirmed via
   the literal `Timed out fetching a new connection from the connection
   pool... connection limit: 9` error. Fixed by applying the `.env.example`
   value to the actual running `.env`.

## Database and migrations

```
$ createdb -O milaserv milaserv_crm360_clean_test
$ DATABASE_URL=...milaserv_crm360_clean_test... npx prisma migrate deploy
7 migrations found in prisma/migrations
Applying migration `20260723170836_init`
Applying migration `20260723180010_remove_unused_lead_active_owner_marker`
Applying migration `20260723181524_lead_disposition_refill_fields`
Applying migration `20260723182958_call_match_lead_assignment_refs`
Applying migration `20260723183139_call_direction_internal`
Applying migration `20260723185141_cdr_staging_multi_leg_fix`
Applying migration `20260723194146_phase12_dashboard_index_review`
All migrations have been successfully applied.

$ npx prisma migrate status
Database schema is up to date!
```
Exit 0. Ran against a brand-new, empty database (`milaserv_crm360_clean_test`),
not the accumulated dev database - proves the full migration history applies
cleanly from nothing, in order, with no manual intervention.

Spot-checked constraints on that clean database directly via `psql`:
- `lead_order_references_external_order_number_key` UNIQUE - confirmed.
- `cdr_records_cdr_record_id_key` UNIQUE - confirmed.
- `lead_dispositions_refill_period_check` CHECK (26-80) - confirmed.
- `lead_assignments_active_agent_marker_key` / `active_lead_marker_key`
  UNIQUE (the "one active lead per agent / one active assignment per lead"
  constraints) - confirmed.
- 40 tables total, matching the full schema.

## Seed (clean database)

```
$ DATABASE_URL=...milaserv_crm360_clean_test... \
  SEED_TEAM_LEADER_EMAIL=admin@milaserv.local \
  SEED_TEAM_LEADER_PASSWORD='CleanTest123!' \
  npx ts-node prisma/seed.ts
Seeded Team Leader: admin@milaserv.local (d425d988-9daa-4e18-9855-acbfdfff0b4c)
```
Exit 0. Also confirmed the seed script correctly *refuses* to run without
`SEED_TEAM_LEADER_EMAIL`/`SEED_TEAM_LEADER_PASSWORD` set
(`Error: SEED_TEAM_LEADER_EMAIL and SEED_TEAM_LEADER_PASSWORD must be set...`) -
no silent default credential exists. The test database was dropped after
this verification (`DROP DATABASE milaserv_crm360_clean_test`).

## Build (full monorepo)

```
$ pnpm build
packages/contracts build: Done
packages/database build: ✔ Generated Prisma Client (v5.22.0)
packages/validation build: Done
apps/api build: Done
apps/worker build: Done
apps/web build:  ✓ Compiled successfully
apps/web build:  ✓ Generating static pages (27/27)
```
Exit 0. All 27 Next.js routes prerendered (up from 24 before this pass's
`connection_limit`/pagination/lint fixes touched two more pages' response
shapes - `admin/import-history` and `admin/cdr-imports` - both re-verified
to still typecheck and build after the `GET /imports/batches` response
shape change).

## Docker Compose

```
$ docker compose config
(full, valid, interpolated compose config printed - see below)
Exit 0.

$ docker compose build
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Exit 1.

$ service docker start
/etc/init.d/docker: 62: ulimit: error setting limit (Operation not permitted)
Exit non-zero (daemon does not start).
```
`docker compose config` (pure syntax/variable-interpolation validation, no
daemon required) passes cleanly - the compose file itself is valid. The
Docker *daemon* cannot start in this sandbox at all (a `ulimit`/capability
restriction confirmed by directly attempting `service docker start`, not a
registry-access issue - unchanged from Phase 12's finding, re-confirmed
fresh this pass). `docker compose build`/`up` remain genuinely unverified in
this specific environment. **This must be re-verified on a host with a
working Docker daemon before relying on it for the demo** - it cannot
honestly be marked PASS here.

## Health checks (dev-mode processes, not containers - the only way to run
## the app end-to-end in this sandbox)

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health
200

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
200

$ ps aux | grep worker/src/main
(worker process present, log shows "Milaserv CRM360 worker started",
 no errors)
```
All three processes (API, worker, web) started fresh from a cold state
(services were restarted mid-session) and confirmed healthy.

## Summary

| Command | Result |
|---|---|
| `pnpm install` | ✅ Pass |
| `prisma generate` | ✅ Pass |
| `pnpm -r lint` | ✅ Pass (0 errors, 56 accepted warnings) - was completely broken before this pass |
| `pnpm -r typecheck` | ✅ Pass - caught and fixed a real missing-dependency bug in `packages/ui` |
| `pnpm -r test` (unit) | ✅ Pass - 137 tests total (56 validation + 81 api) |
| `pnpm --filter @milaserv/api test:e2e` (integration/concurrency) | ✅ Pass - 3 tests, did not exist before this pass |
| `prisma migrate deploy` on a clean database | ✅ Pass - 7/7 migrations, all constraints confirmed |
| `prisma migrate seed` on a clean database | ✅ Pass |
| `pnpm build` (full monorepo) | ✅ Pass - all 27 web routes prerendered |
| `docker compose config` | ✅ Pass |
| `docker compose build` / `up` | ❌ Cannot run - daemon unavailable in this sandbox, unrelated to the app itself |
| API/worker/web health checks | ✅ Pass |
