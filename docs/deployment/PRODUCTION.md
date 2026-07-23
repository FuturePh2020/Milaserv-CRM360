# Production Deployment

> Status: documented target process for the pilot described in
> `docs/release/PILOT_MONITORING.md`. Not yet exercised. Do not treat this as
> a validated runbook until Phase 12 sign-off.

## Capacity target

At least 200 registered/concurrent users, long-term high-volume lead storage,
large daily CDR imports. See `docs/specifications/MILASERV_CRM360_MVP.md` §20
and the performance section of `docs/architecture/ARCHITECTURE.md`.

## Requirements before promoting a build to production

All of these gates from `docs/implementation/IMPLEMENTATION_PLAN.md`'s
Definition of Done must hold repo-wide, not just for the newest phase:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass.
- Concurrency tests (Generate Lead, Take Lead, No Answer/Busy release —
  `docs/testing/TEST_PLAN.md`) pass against a Postgres instance, not mocks.
- Security review (`docs/architecture/SECURITY.md` checklist) re-confirmed.
- Migrations reviewed — `prisma migrate deploy`, never manual DDL, per the
  non-negotiable rule in `CLAUDE.md`.
- Backups configured and a restore has been test-run (see below).

## Deploy process (target)

1. Build and tag images from a release commit (`docker compose build`, push
   to a registry reachable by the production host).
2. Take a database backup immediately before migrating (see Rollback).
3. `prisma migrate deploy` against production `DATABASE_URL`.
4. Roll `api`/`worker`/`web` containers.
5. Run the smoke test in `docs/deployment/LOCAL_SETUP.md` §6 against the
   production URL.
6. Monitor per `docs/release/OPERATIONS_RUNBOOK.md` for the first hours.

## Backups

- PostgreSQL: scheduled `pg_dump` (or provider-managed snapshots) with a
  retention policy long enough to cover the audit/compliance needs implied
  by storing national IDs and insurance claim data. Exact schedule/retention
  is an infra decision outside this repo's scope — document it here once
  chosen.
- Redis: BullMQ job data is transient (imports/CDR processing); Redis
  persistence is a nice-to-have for not losing in-flight jobs on restart, not
  a source of truth. Do not treat Redis as needing the same backup rigor as
  Postgres.

## Secrets management

Production secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`DEVICE_TOKEN_SECRET`, `POSTGRES_PASSWORD`, etc.) must come from the
deployment platform's secret manager, never from a committed `.env`. Rotate
`JWT_*` secrets requires coordinated logout of all sessions (every existing
refresh token becomes invalid the moment the secret changes) — plan rotations
for low-traffic windows.

## Scaling notes

- `api` and `worker` are stateless and can run multiple replicas; BullMQ
  concurrency is per-worker-process (`WORKER_CONCURRENCY`), so horizontal
  worker scaling is additive.
- Postgres is the actual concurrency-control point for lead distribution
  (row locking / `SKIP LOCKED`) — scaling `api` replicas does not weaken the
  atomicity guarantees described in `docs/architecture/DATA_MODEL.md`.
- **Size `DATABASE_URL`'s `connection_limit`/`pool_timeout` for real
  concurrent load, not Prisma's default.** A live test in this repo's
  history (55 simultaneous `Generate Lead` calls) failed with "Transaction
  already closed" under Prisma's default connection pool
  (`num_cpus*2+1`) — the app-level fix (raising the Generate/Take Lead
  transaction's `maxWait`/`timeout`) only helps if there's also a large
  enough pool for those transactions to actually get a connection. At the
  200-concurrent-Agent target, size the pool per `api` replica accordingly
  and confirm `POSTGRES` `max_connections` comfortably covers
  `replicas × connection_limit` plus the worker and any admin tooling.
