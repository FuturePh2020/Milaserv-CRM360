# Data Model

Full schema: `packages/database/prisma/schema.prisma`. This document explains
the non-obvious constraint design; see `docs/specifications/MILASERV_CRM360_MVP.md`
section 21 for the model list this was derived from.

## The "partial unique index" problem

Several rules are naturally partial-unique-index constraints: "at most one
**active** assignment per lead", "at most one **active** lead per agent", "at
most one **open** session per user". Postgres supports partial unique indexes
via `CREATE UNIQUE INDEX ... WHERE ...`, but Prisma's schema language does not
have first-class syntax for a `WHERE` clause on `@@unique`. This schema uses
the standard workaround instead: a nullable marker column that is non-null
only while the row is "active", combined with a normal (non-partial)
`@@unique`. Postgres treats every `NULL` in a unique index as distinct from
every other `NULL`, so closed/released rows (marker = `NULL`) never collide,
while at most one active row (marker = non-null) can exist per key.

Applied to `LeadAssignment`:

- `activeLeadMarker` is set to the lead's id while the assignment is the
  current lock, and set to `NULL` the moment it's released (disposition
  saved, admin reassignment, etc). `@@unique([activeLeadMarker])` then
  guarantees at most one active assignment per lead.
- `activeAgentMarker` is the same idea keyed by agent id, guaranteeing at
  most one active lead per Agent.
- Both markers live on the same table and the same row, so claiming a lead
  (`Generate Lead` / `Take Lead`) is a single insert that either satisfies
  both unique constraints or fails atomically — there is no window where one
  constraint holds and the other doesn't.

The same pattern is used for `WorkSession.activeOwnerMarker` (at most one
open session per user).

`UserLeadPermission.partner` uses a related but distinct fix: it is **not**
nullable (default `"ALL"`) specifically because upserting a permission with
"no partner restriction" needs the second and third grant to actually match
the first — an `ALL` sentinel makes that equality work under Postgres' normal
(non-partial) unique semantics, where a nullable column would have let every
"no restriction" grant insert a duplicate row.

## Insurance vs Cash: header/item split

Both `med_gulf_sample.xlsx` (insurance) and `cash_leads.xlsx` (cash) are
item-level source files — repeated rows for the same customer/claim, one row
per medication. The schema never stores one `Lead` per source row; the import
pipeline (Phase 2/3) groups rows into one `Lead` (header) with N
`LeadMedicationItem` rows (items):

- Insurance grouping key: `NATIONALID + claim_seq_id` (fallback: normalized
  phone + `INVOICENO` + `SERVICEDATE`). Item uniqueness: `inv_item_idm`
  (fallback: `claim_seq_id + code`).
- Cash grouping key: normalized phone + source lead date + branch code. Item
  uniqueness is synthesized at parse time since the raw file has no item id.

`Lead.groupKey` stores whichever key produced that lead, so re-imports can
detect "this row belongs to an existing lead" idempotently.

## Long identifiers stay strings

`claimSequenceId`, `invoiceNo`, `policyNo`, `payerId`, `preauthReferenceNo`,
`nationalId`, `sourceItemKey`, `upcCode` are all `String` fields, never
`Int`/`Decimal`/`Float`. The sample data includes values like national ID
`2054223520` and claim id `260414140145010045` — both exceed safe JS integer
handling in places and both can carry meaningful leading zeros (UPC codes),
so they are never parsed as numbers anywhere in the pipeline, per spec rule.

## Audit trail model

`LeadStatusHistory` records every status transition; `LeadAssignment` is
never overwritten (a release sets `releasedAt`/`releaseReason` but the row
stays); `AuditLog` is a generic before/after actor-stamped log for
administrative actions (user/team/shift changes, reassignment, permission
grants). Nothing in the lead lifecycle does a destructive update without also
writing history.

## CDR staging vs relevant records

`CdrStagingRecord` holds every parsed row from an uploaded CDR file,
including the thousands of calls unrelated to any lead. `CdrRecord` is
populated only for rows whose normalized customer phone matches an indexed
lead phone number (`Person.phoneNormalized`) — this is what keeps CDR
matching from becoming an O(rows × leads) operation. See
`docs/architecture/ARCHITECTURE.md` and Phase 9 for the matching pipeline.

## Status

Schema is implemented and migrated (`packages/database/prisma/schema.prisma`,
migration `20260723170836_init`, applied and verified locally in this
session). Application code that reads/writes most of these tables (imports,
lead distribution, dispositions, CDR) is not yet built — see
`docs/implementation/IMPLEMENTATION_STATUS.md`.
