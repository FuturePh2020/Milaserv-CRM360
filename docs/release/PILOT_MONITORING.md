# One-Month Pilot Monitoring Plan

> Status: plan for after Phase 12 sign-off. Not started — no pilot has run.

## Pilot scope

Recommended: one team, one shift, a handful of Agents, both Cash and
Insurance lead types active, real (not synthetic) Yeastar CDR feed if
available, running for at least one full monthly attendance cycle so
`AttendanceDay`/monthly reporting gets exercised with real data.

## What to watch daily during the pilot

- Import success rate: any batch stuck in `PROCESSING` or ending
  `COMPLETED_WITH_ERRORS` beyond expected data-quality noise.
- Generate Lead / Take Lead error rates — any `409`/conflict spikes beyond
  the expected "someone else already has it" case.
- CDR match rate: proportion `MATCHED` vs `NOT_MATCHED`/`AMBIGUOUS` — a low
  match rate likely means the extension mapping or CDR timezone setting is
  wrong, not that agents aren't calling.
- Break totals: spot-check a few agents' `AttendanceDay` rollups against
  what the activity companion actually reported, to catch idle-detection
  bugs early while the blast radius is small.
- Any account lockouts, and whether they were legitimate.

## What to watch weekly

- Query performance on the dashboards as lead volume grows — confirm
  pagination/indexes are actually being hit (`EXPLAIN ANALYZE` the slow
  ones) rather than assuming the schema design is sufficient forever.
- Disk usage growth (Postgres, uploaded files, CDR staging tables) — decide
  on the archive strategy referenced in
  `docs/specifications/MILASERV_CRM360_MVP.md` §20 before it becomes urgent.

## Exit criteria for ending the pilot and expanding rollout

- No open Sev1/Sev2 incidents in the final pilot week.
- CDR match rate and import error rate stable and understood (not
  necessarily zero — understood).
- At least one full monthly attendance cycle reviewed by an actual Shift
  Supervisor/Team Leader and confirmed to match their expectations.
- Backup restore drill (`docs/release/ROLLBACK.md`) completed successfully
  during the pilot window, not just planned.
