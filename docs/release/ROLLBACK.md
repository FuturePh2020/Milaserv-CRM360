# Rollback

## Application rollback

Since `api`/`worker`/`web` are stateless containers, rolling back to the
previous image tag is safe as long as the database schema is compatible with
that previous version (see Migration rollback below). Standard process:

1. Redeploy the previous known-good image tags for `api`, `worker`, `web`.
2. Confirm `GET /health` and a login smoke test succeed.
3. Investigate the failure that triggered the rollback before re-attempting
   the deploy.

## Migration rollback

Prisma does not generate automatic "down" migrations. This project's policy:

- Every migration that could lose data (dropping a column/table, narrowing a
  type) must ship with a written rollback note in the migration's directory
  describing the manual reverse SQL, reviewed at PR time — **before** it is
  applied to staging/production, not after something goes wrong.
- Purely additive migrations (new nullable column, new table, new index) are
  safe to leave in place even if the application is rolled back to a
  previous version that doesn't use them yet.
- Never run `prisma migrate reset` against staging or production — it drops
  and recreates the database. It is a local-dev-only command.

Because no migration beyond `20260723170836_init` exists yet, this policy
has not yet been exercised. Revisit this document the first time a
schema-narrowing migration ships.

## Data-safety rollback (imports / CDR)

If a bad import batch was confirmed but already processed:

- Prefer marking the batch `ARCHIVED`/reversing via application logic (not
  yet built — tracked in Phase 2) over deleting rows directly, so the audit
  trail explains what happened and why.
- Because grouping/idempotency keys are deterministic
  (`docs/architecture/DATA_MODEL.md`), re-running the corrected import after
  fixing the source file should not create duplicates of leads that were
  correctly imported the first time.

## Backup restore drill

Not yet performed. Before production go-live, actually restore a backup to a
scratch environment and confirm the application boots against it — do not
assume backups are restorable without having tried.
