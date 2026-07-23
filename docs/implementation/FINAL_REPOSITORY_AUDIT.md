# Final Repository Audit

Date: 2026-07-23. Scope: every area listed in the final-audit prompt, cross-
checked against the existing `docs/implementation/IMPLEMENTATION_STATUS.md`,
`docs/testing/TEST_PLAN.md`, and `docs/architecture/SECURITY.md` (all three
already carry phase-by-phase, live-verified detail - this document does not
repeat that detail, it classifies and cross-references it, and records what
is *new* in this pass: a repo-wide keyword/pattern sweep, an ESLint fix that
had never actually been runnable before, and the real defects that sweep
found).

## Legend

- **COMPLETE** - built, tested (unit and/or live), matches the spec.
- **PARTIAL** - built and working for the core case, with a specific
  documented gap.
- **MISSING** - not built at all.
- **BROKEN** - was found broken during this audit; either fixed (noted) or
  still open.
- **SECURITY RISK** - a real exposure, not a style nitpick.
- **NEEDS TESTING** - implemented, but no automated test exists yet.

## Methodology for this pass

1. Repo-wide grep for `TODO|FIXME|HACK|XXX`, `placeholder|mock|fake data`,
   `Not implemented`, silent `catch {}` blocks, `: any`/`as any` in
   production code, `console.log`-only implementations, direct
   password/token `===` comparisons, `@Public()` usage, unpaginated
   `findMany`, and raw SQL (`$queryRaw`/`$executeRaw`).
2. Verified whether `pnpm lint` / `eslint` could actually run at all
   (it could not, repo-wide, before this pass - see "ESLint" below).
3. Re-ran the full test suite and `tsc --noEmit`/build after every fix to
   confirm nothing regressed.
4. Cross-referenced every area below against the corresponding phase
   section in `IMPLEMENTATION_STATUS.md` rather than re-deriving already-
   documented findings from scratch.

## Real defects found and fixed this pass

| # | Finding | File | Fix |
|---|---|---|---|
| 1 | `eslint` could not run at all for `apps/api` or `apps/worker` - neither package declared `eslint`/`@typescript-eslint/*` as a dependency, so `npx eslint` silently resolved a fresh, incompatible ESLint 10 install (flat-config-only) instead of the workspace's pinned 8.57.1, and failed outright with no config file. This is why every earlier phase's status doc says "eslint could not be run" - it was never actually attempted successfully. | `apps/api/package.json`, `apps/worker/package.json`, plus `packages/{validation,contracts,ui,database}/package.json` (had no lint script at all) | Added `eslint`/`@typescript-eslint/eslint-plugin`/`@typescript-eslint/parser` (pinned to versions already vendored in the pnpm store - no new network installs required) and a `.eslintrc.json` per package. `pnpm lint` now genuinely runs and passes across every package. |
| 2 | **Dead code / copy-paste bug**: `normalizeSaudiPhone` had two `else if` branches with the literally identical condition (`digitsOnly.startsWith("5") && digitsOnly.length === 9` and its operands swapped) - caught by ESLint's `no-dupe-else-if` the moment lint could actually run. Harmless in practice (the first branch already handled every case the second claimed to), but a real, confirmed defect - not a style issue. | `packages/validation/src/phone.ts` | Removed the unreachable duplicate branch. Full validation suite (56/56) re-run and still green after the change. |
| 3 | `bootstrap()` called without `void`/`.catch()` in both API and worker entrypoints - an unhandled-promise-rejection risk `@typescript-eslint/no-floating-promises` correctly flagged as an error, not a warning. | `apps/api/src/main.ts`, `apps/worker/src/main.ts` | Changed both to `void bootstrap();`. |
| 4 | Unused import (`CallMatchStatus`) left over from an earlier edit. | `apps/api/src/dashboards/dashboards.service.ts` | Removed. |
| 5 | **Unpaginated `findMany`**: `GET /imports/batches` (Import History nav page) returned every batch ever created with no `skip`/`take` - the one genuinely unbounded list query found in this sweep (every other list endpoint added since Phase 10 already paginates: Audit Log, session/break history, `leadImportError` listing). Not yet a real problem at MVP data volumes, but exactly the kind of thing that silently degrades after months of real imports. | `apps/api/src/imports/imports.service.ts`, `imports.controller.ts` | Added `page`/`perPage` (default 50), returns `{batches, total, page, perPage}`. Updated both frontend callers (`admin/import-history` - added real pagination controls matching the Audit Log page's pattern; `admin/cdr-imports` - requests up to 100 to keep its existing client-side CDR filter working) since the response shape changed from a bare array to an object. |
| 6 | `test:e2e` was a declared, never-implemented script: it referenced `./test/jest-e2e.json`, but neither that file nor a `test/` directory existed anywhere in `apps/api`. Every phase's status doc that claimed "verified live" for the concurrency-sensitive Generate Lead / Take Lead / No Answer-Busy scenarios meant a one-off manual curl session, not a repeatable test. | `apps/api/test/` (new), `apps/api/package.json` | Built a real e2e harness (`Test.createTestingModule` + a genuinely bound port via `app.listen(0)` - supertest's default lazy-bind is measurably flakier than a real listening server under 50-way fan-out, causing spurious `ECONNRESET`s until this was added) and three committed tests: the No Answer/Busy 13-point release-and-recontest rule, 50-agent Generate Lead concurrency, and a 10-agent Take Lead race. All three pass repeatably and clean up every row they create. |
| 7 | **Live `.env` had silently drifted from its own documented recommendation**: `.env.example` already comments that "Prisma's default pool is small" and ships `connection_limit=60&pool_timeout=20` on its example `DATABASE_URL` - but the actual running `.env` in this environment never had that suffix applied, leaving Prisma's real default pool (a mere **9** connections, confirmed via the literal error message once 50 concurrent transactions contended for it) in effect the whole time. This is exactly the gap Phase 6 flagged ("documented sizing `DATABASE_URL`'s `connection_limit`... an infra/config concern, not just code") - flagging it evidently wasn't enough; the live config still didn't match the doc until a real 50-concurrent test forced the mismatch to surface. | `.env` (gitignored, not committed - a local environment fix, not a code change) | Applied the same `connection_limit=60&pool_timeout=20` `.env.example` already recommends. The 50-agent e2e test only passes with this in place; anyone standing up a fresh `.env` from the example is already protected, but this is worth calling out explicitly since a stale `.env` predating that example update would have silently carried the same 9-connection ceiling into a real pilot. |
| 8 | **Real missing-dependency bug**: `packages/ui/src/tokens.ts` imports `@milaserv/contracts`, but `packages/ui/package.json` never declared it as a dependency. It only ever resolved by accident because `apps/web`'s Next.js/webpack build pulls both packages' source into one graph regardless of each package's own declared dependencies - `packages/ui`'s own `tsc --noEmit`, run in isolation against its own `node_modules`, failed outright with `Cannot find module '@milaserv/contracts'` the moment `pnpm -r typecheck` was actually run repo-wide (each package's typecheck script existed since earlier phases, but nothing had ever run them all together in one pass before this one). | `packages/ui/package.json` | Added `@milaserv/contracts: workspace:*` as a real dependency; `pnpm install` re-linked the workspace symlink; `packages/ui`'s typecheck now passes standalone, and the repo-wide `pnpm -r typecheck` passes across all 8 packages with scripts. |

No other `TODO`/`FIXME`/`HACK`, silent catch block, unsafe raw-SQL usage,
direct-token `===` comparison, or unprotected endpoint was found. The two
"XXX" grep hits were false positives (phone-format comments like
`5XXXXXXXX`), and `docs/specifications/*.md` legitimately contain "TODO"-
adjacent language as *spec* prose, not implementation shortcuts.

## Area-by-area classification

| Area | Status | Notes |
|---|---|---|
| Monorepo structure / package manager / Node version | COMPLETE | pnpm 10.33.0 workspace, Node >=20 (running on 22.22.2), `apps/{web,api,worker,activity-agent}` + `packages/{database,contracts,validation,ui,config}`. |
| Prisma schema / migrations | COMPLETE | 7 migrations, apply cleanly (see Step 3 below); `prisma validate` passes. |
| PostgreSQL / Redis config | COMPLETE | Local Postgres 16 + Redis 7 verified live this session (Docker daemon unavailable in this sandbox - see below). |
| Docker / Docker Compose | PARTIAL | `docker compose config` (syntax/env validation) passes. `docker compose up`/`build` **cannot be exercised in this sandbox** - the daemon itself refuses to start (`ulimit`/capability restriction, confirmed again this session with `service docker start`), not a registry-access issue. Unchanged from Phase 12's finding. Must be re-verified on a host with a working daemon before relying on it for the demo. |
| Authentication (login/logout/refresh/lockout) | COMPLETE | See Phase 1 in `IMPLEMENTATION_STATUS.md`; live-verified, unit-tested. |
| Password security | COMPLETE | argon2 hashing, no plaintext anywhere, no direct `===` token/password comparisons found in this sweep. |
| Role guards / scope guards | COMPLETE | Global `JwtAuthGuard`+`RolesGuard`; `@Public()` usage audited this pass - exactly 4 legitimate public routes (`health`, `login`, `refresh`, device heartbeat via its own `DeviceAuthGuard`), no accidental exposure found. |
| Users / Teams / Shifts / Permissions | PARTIAL | CRUD complete and live-verified; still NEEDS TESTING for automated coverage on `UsersService`/`TeamsService`/`ShiftsService` beyond manual curl (unchanged since Phase 1). |
| Sessions / Breaks / Attendance | COMPLETE | Full state machine, unit-tested (12 tests) and live-verified including force-close and the No-Answer/Busy-adjacent guards (Generate/Take/Call all require an active, non-break session). |
| Activity companion (Windows) | MISSING (verification), COMPLETE (server side) | Server-side heartbeat/idle-break logic is done, unit-tested, and live-verified with the spec's literal worked example. The .NET companion itself has never been compiled or run anywhere - no Windows/.NET SDK exists in any environment this project has been built in. This is the single largest functional gap in the whole system: **idle-break detection does not work in practice today because nothing has ever run the client that reports idle time.** |
| Lead imports (Cash/Insurance/CDR) | COMPLETE | Live-verified against all three real sample files; background processing via BullMQ; idempotent; downloadable error CSV. Import History pagination fixed this pass (see defects table). |
| Insurance / Cash mapping | COMPLETE | Grouping keys, child items, raw-value preservation, legacy-status mapping all live-verified against real files (Phase 3). |
| Phone normalization | BROKEN → FIXED | Dead-code duplicate branch (see defects table). Functionally the normalization was already correct (the duplicate branch was unreachable, not a wrong result), but it was a genuine defect, not a style nit. |
| Generate Lead / Take Lead | COMPLETE | Proven under real ≥50-concurrent load, `SELECT ... FOR UPDATE SKIP LOCKED`, atomic, deterministic ordering - see Phase 6. |
| Call Customer | COMPLETE | Ownership + session checks, `PENDING_CALL → CUSTOMER_CONTACTED`, click never treated as a verified call (CDR is the only verification path). |
| Dispositions (all 10 + No Answer/Busy exact rule) | COMPLETE | All 10 dispositions implemented; the No-Answer/Busy 13-point rule from this audit prompt was live-verified end-to-end in Phase 7 (Agent A → NO_ANSWER_BUSY → CALLBACK_ELIGIBLE → concurrent Take Lead race between two other agents → exactly one winner → original assignment preserved in history, not deleted). Re-confirmed this session via a fresh live click-through (Generate → Call → Save Disposition) during the earlier navigation build-out. |
| Order Created / Already Dispensed / Reschedule | COMPLETE | Unique external order number (DB-enforced), refill range 26-80 (DB CHECK constraint confirmed this pass), follow-up scheduling keeps ownership and is excluded from Take Lead eligibility. |
| Leads Search (Agent + Admin) | COMPLETE | Masking, household grouping, permission filtering, rate-limited; Admin-scoped unmasked variant added this build-out (`GET /leads-search/admin`), sharing the same core logic via `runSearch` so masking can't drift between the two routes. |
| Yeastar CDR import and matching | COMPLETE | Multi-leg grouping, timezone conversion, full match-status decision tree, idempotent re-import - three real bugs found and fixed live in Phase 9 (duplicate-batch 500, N+1 preview performance, multi-leg data loss), all re-verified against the real 65,535-row sample file. |
| Dashboards and reports | COMPLETE | All four spec report shapes, team-scoped correctly for Shift Supervisors, backed by a fixed small number of aggregate queries (no N+1) - re-confirmed this pass by reading `dashboards.service.ts` fresh, no per-agent-per-query loops found. |
| Real-time / auto-refresh | PARTIAL | 15-second polling fallback (`refetchInterval`) is used everywhere, never a full-page reload - confirmed across every new page built this session. The SSE endpoint (`/dashboards/overview/stream`) exists server-side but is not wired into the frontend (unchanged gap from Phase 11). |
| Branding | COMPLETE | Brand tokens match spec exactly; verified live in a browser at desktop and mobile viewports (Phase 11), and every new page built since reuses the same tokens/components. |
| Exports | PARTIAL | Converted Leads CSV export and Import error CSV export both work (authenticated fetch+blob, confirmed live). Overview/Leads-Summary/Agent-Performance have no export endpoint - unchanged gap from Phase 10. |
| Audit logs | COMPLETE | Written since Phase 1 for every sensitive action; a listing/filter endpoint (`GET /audit-log`) was added this build-out so they're actually viewable, not just written. |
| Tests | PARTIAL | 81/81 API unit tests, 56/56 validation unit tests, all passing. No automated frontend test suite (`apps/web` has zero `test` script) - verification there has been live/scripted Playwright, not a committed, repeatable suite. |
| Deployment files | PARTIAL | `docker-compose.yml`/`.env.example` exist and `docker compose config` validates; actual container build/run unverified in this sandbox (daemon restriction). Demo-specific Nginx gateway added this pass - see Step 5. |

## Grep sweep results (full detail)

- `TODO|FIXME|HACK|XXX`: 4 files matched, all false positives (phone-format
  comments and specification prose) - zero real markers in application code.
- `placeholder|mock|fake data|Not implemented`: 19 files matched, every one
  either a legitimate "no data yet" UI empty-state string (e.g. "No
  dispositions recorded yet.") or a Jest/Vitest test file's Prisma mock -
  zero actual placeholder/stub implementations masquerading as complete.
- Silent `catch {}` / `catch (e) {}` blocks: **zero** found anywhere in
  `apps/api` or `apps/web`.
- `: any` / `as any` in production (non-test) code: 3 occurrences, all
  narrow and justified - `SystemSetting.value` is a Prisma `Json` column
  (`settings.service.ts`), and one loosely-typed CDR report summary shape on
  the frontend. Every other `any` is confined to test files mocking the
  Prisma client, a standard and accepted pattern (not tightened, since doing
  so would mean hand-typing a mock for every Prisma model surface with no
  behavioral benefit).
- Direct password/token `===` comparisons: **zero** - passwords go through
  argon2, refresh/device tokens are SHA-256-hashed then looked up by hash
  (never compared as raw strings in application code).
- `@Public()` usage: exactly 4 routes, all legitimate (health check, login,
  refresh, device heartbeat - the last guarded by `DeviceAuthGuard` instead
  of the user JWT guard, not left open).
- Unbounded `findMany` (no `take`/`skip`): one real instance found and fixed
  (Import History, see defects table above). `extension-mappings` listing
  also has no pagination, but is naturally bounded by the number of real
  PBX extensions in an organization (dozens, not thousands) - flagged as
  low-priority, not fixed, since adding pagination there has no realistic
  benefit at the data volumes this table will ever hold.
- Raw SQL (`$queryRaw`/`$executeRaw`): confined to `leads.service.ts`
  (the `SELECT ... FOR UPDATE SKIP LOCKED` candidate-selection query,
  parameterized, not string-concatenated) and `dashboards.service.ts`
  (aggregate `groupBy`-style counts) - both already reviewed and covered by
  tests in earlier phases, no new issues found on re-inspection.

## Known limitations carried forward (not re-litigated here)

Every gap already honestly documented in `IMPLEMENTATION_STATUS.md`'s
per-phase "Known gaps" sections and `SECURITY.md`'s checklist remains
accurate as of this audit and is not repeated in full here - see those
documents for: cross-midnight attendance splitting, `PARTIAL_SESSION`/
`VACATION`/`DAY_OFF` never being assigned, no password-reset flow, no
column-mapping UI, exact-match-only search, no team-scoping on imports/CDR,
no staging deployment/UAT/backup-restore drill, and load testing capped at
the ~9-55 concurrent-request scale reachable interactively in this
environment (not the spec's 200+ user target).
