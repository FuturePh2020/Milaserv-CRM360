# Implementation Plan

This mirrors `docs/specifications/PHASE_PROMPTS.md`. Each phase is meant to be
independently reviewable, committed, and (where practical) tested before the
next begins.

| Phase | Scope | Key risk this phase retires |
|---|---|---|
| 0 | Repo scaffold, Prisma schema for the full domain, architecture docs | Wrong data model shape is the most expensive mistake to fix later |
| 1 | Auth, RBAC, users, teams, shifts, audit log | Every later phase depends on `AuthenticatedUser` + guards |
| 2 | Import framework: batches/files/rows/errors, BullMQ wiring, upload security, preview/progress | Cash and Insurance parsers (Phase 3) need somewhere to write into |
| 3 | Cash + Insurance parsers against the real sample files | Grouping/normalization correctness, verified against actual sample rows |
| 4 | Sessions, manual breaks, attendance | Generate Lead (Phase 6) depends on "is this agent in an active, non-break session" |
| 5 | Activity companion + idle breaks | Device-wide idle detection; Windows-only, needs a Windows build environment to fully verify |
| 6 | Atomic lead distribution (Generate Lead, Take Lead) | Concurrency correctness under ~50+ simultaneous requests |
| 7 | Call Customer + dispositions | Conditional rules (refill calc, order number uniqueness, No Answer/Busy release) |
| 8 | Search + Take Lead | Masking correctness, household grouping |
| 9 | Yeastar CDR import + matching | Large-file performance, direction-aware parsing, IVR/Queue exclusion |
| 10 | Dashboards, reports, real-time updates | Aggregation performance at 200-user / millions-of-leads scale |
| 11 | Branding/UX polish | Applied last so it doesn't get redone as features change shape |
| 12 | Security/perf/release readiness | Final gate before "final acceptance" in the master prompt |

## Sequencing rationale

Phases 2-3 (import) are placed before 6-8 (distribution/search) because
distribution and search operate on `Lead` rows that only exist after import.
Phase 4 (sessions/breaks) is placed before Phase 6 because Generate Lead's
first precondition is "active session, not on break." Phase 9 (CDR) depends
on Phase 6/7 (assignment history, call attempts) existing to match against.

## Definition of done, per phase

Copied from the specification (`docs/specifications/MILASERV_CRM360_MVP.md`
§27) and applied literally, not loosely:

1. Migration exists (if the phase touches the schema).
2. Backend validation exists.
3. Backend authorization exists.
4. UI exists (where the phase includes UI).
5. Loading/empty/error states exist.
6. Audit event exists where relevant.
7. Automated tests exist and pass.
8. Manual QA steps are documented.
9. No TypeScript/lint/build errors.
10. Migration and rollback notes exist.
11. Sample imports are tested against the actual files in `docs/samples/`.
12. Responsive behavior is checked.
13. No existing module is broken (typecheck/test the whole repo, not just the new phase).
14. README or module documentation is updated.

`docs/implementation/IMPLEMENTATION_STATUS.md` tracks which of these boxes are
actually checked per phase — if a box isn't checked, the status doc says so
rather than the phase being marked done anyway.
