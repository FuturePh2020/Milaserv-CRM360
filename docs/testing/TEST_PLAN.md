# Test Plan

Source of truth for required tests:
`docs/specifications/MILASERV_CRM360_MVP.md` §24. This document maps each
required test to where it lives (or will live) in the codebase and its
current status.

## Legend

- ✅ implemented and passing
- 🚧 planned, not yet implemented
- N/A not applicable to current phase

## Auth / RBAC (Phase 1)

| Test | Location | Status |
|---|---|---|
| Unknown email does not reveal account existence | `apps/api/src/auth/auth.service.spec.ts` | ✅ |
| Account locks after configured failed-attempt threshold | same | ✅ |
| Locked account rejected even with correct password | same | ✅ |
| Failed-attempt counter resets on successful login | same | ✅ |
| Revoked/expired refresh token rejected | same | ✅ |
| Agent blocked from admin endpoints (403) | manual curl, this session | 🚧 needs an automated e2e test |
| Shift Supervisor limited to assigned team scope | service-layer logic exists (`UsersService.scopeFilter`, `TeamsService`, `ShiftsService.assertTeamScope`) | 🚧 no automated test yet |
| Hidden frontend action still blocked by backend | global `JwtAuthGuard`/`RolesGuard` design | 🚧 no automated test yet |

## Phone / date / price parsing (Phase 0, ahead of Phase 3)

| Test | Location | Status |
|---|---|---|
| All equivalent Saudi phone input forms normalize identically | `packages/validation/src/phone.test.ts` | ✅ 9 cases |
| Invalid phone input rejected | same | ✅ |
| Mask keeps prefix + last 2 digits only | same | ✅ |
| `1.26K` price parses to 1260, raw retained | `packages/validation/src/price.test.ts` | ✅ |
| Plain numeric/zero prices parse correctly | same | ✅ |
| Invalid price flagged, not silently coerced | same | ✅ |
| DD/MM/YYYY and MM/DD/YYYY parse per explicit format (no guessing) | `packages/validation/src/dates.test.ts` | ✅ |
| Impossible dates rejected | same | ✅ |
| 2-digit years (as actually rendered by the real sample files) expand correctly | same | ✅ (caught a real bug live: unparsed 2-digit years silently produced year 26 AD) |
| Refill date calculation | same | ✅ |
| Refill period outside 26–80 rejected | same | ✅ |
| Cash legacy status mapping (`Answered - No Order` etc.) | `packages/validation/src/cash-legacy-status.test.ts` | ✅ |
| Legacy `Agent` label "Name (ext)" parsing | same | ✅ |
| Cash/Insurance grouping and item key precedence (preferred + fallback) | `packages/validation/src/grouping-keys.test.ts` | ✅ |

## Import framework (Phase 2)

| Test | Location | Status |
|---|---|---|
| Spreadsheet row parsing preserves exact source row numbers across blank rows | `packages/validation/src/sheet.test.ts` | ✅ (caught a real SheetJS default-behavior bug live, fixed with `blankrows: true`) |
| Required-column detection matches the real Cash/Insurance sample headers | `packages/validation/src/import-columns.test.ts` | ✅ |
| Empty-required-field detection | same | ✅ |
| Upload/create-batch restricted to Team Leader | `apps/api/src/imports/imports.service.spec.ts` | ✅ |
| Preview/confirm reject batches in the wrong status | same | ✅ |
| End-to-end: upload real `cash_leads.xlsx` → preview → confirm → worker → `COMPLETED_WITH_ERRORS`, with row-accurate error reporting | manual, this session (see `docs/implementation/IMPLEMENTATION_STATUS.md`) | ✅ verified live, 🚧 not yet an automated integration test against a real DB |
| End-to-end: upload real `med_gulf_sample.xlsx` → preview → all rows valid | same | ✅ verified live, 🚧 not automated |
| Re-uploading an identical file is flagged `alreadyUploadedBefore` | same | ✅ verified live, 🚧 not automated |
| In-file duplicate row detection | same (rows 23–28 of `cash_leads.xlsx`, which are genuinely blank duplicates) | ✅ verified live, 🚧 not automated |

## Cash and Insurance parsers (Phase 3)

All verified live against a real Postgres instance, starting from empty
`leads`/`people` tables (see `docs/implementation/IMPLEMENTATION_STATUS.md`
for full detail) - not yet automated as integration tests:

| Test | Status |
|---|---|
| Insurance grouping: multiple medication rows for the same claim → one lead, items separate | ✅ verified live (18 rows → 8 leads/18 items) |
| Insurance long ids preserved exactly (national id, claim/invoice numbers) | ✅ verified live, spot-checked in the DB, no precision loss/scientific notation |
| Cash grouping: repeated phone/date/branch rows → one lead with multiple items | ✅ verified live (the real `500210989`/`P440` pair merged into one 2-item lead) |
| Ambiguous date format requires explicit selection | ✅ enforced (`MISSING_DATE_FORMAT` batch failure if unset); 🚧 no automated test of the rejection path yet |
| `1.26K` price parsing end-to-end through the Cash processor | ✅ verified live (parsed and stored as `1260`) |
| Raw values preserved (`LeadImportRow.rawData`) | ✅ verified live |
| Grouping/item-key idempotency across separate import batches (not just within one file) | ✅ verified live: re-uploaded and fully re-processed the identical `cash_leads.xlsx`; lead count stayed 18, item count stayed 19 |
| Rows that fail Cash/Insurance-specific parsing (bad phone/date) despite passing Phase 2's structural check are recorded as new import errors | ✅ implemented (`CASH_PARSE_FAILED`/`INSURANCE_PARSE_FAILED`); 🚧 not yet exercised against a real malformed row in this session's testing |

## Lead distribution (Phase 6) — not yet built

- Generate Lead: ≥50 concurrent requests, no duplicate lead, one active lead per Agent. 🚧
- Take Lead: two Agents simultaneously, exactly one succeeds, correct history. 🚧

These are the highest-risk untested paths in the whole system and must be
run against a real Postgres instance (not mocks) given they depend on actual
row-locking behavior — a mocked Prisma client cannot prove atomicity.

## Dispositions (Phase 7) — not yet built

- No Answer/Busy: Agent A owns → saves disposition → released → Callback
  Eligible → Agent B takes → Agent C cannot take → Agent A history intact. 🚧
- Follow-up: remains owned, not Take-Lead-eligible, supervisor can reassign. 🚧
- Order Created: mandatory external number, duplicate rejected, Agent blocked
  until save completes. 🚧
- Refill: only 26–80 accepted (parsing already covered above; end-to-end
  disposition flow still 🚧).

## CDR (Phase 9) — not yet built

- Large file, thousands of unrelated numbers ignored. 🚧
- Inbound/outbound direction handled correctly. 🚧
- IVR/Queue excluded from Agent matching. 🚧
- Duplicate import is idempotent (no duplicate `CdrRecord` rows). 🚧
- Ambiguous matches stay `AMBIGUOUS`, never silently resolved. 🚧
- CDR timezone setting honored end-to-end. 🚧

A real fixture is already available for this:
`docs/samples/yeastar_cdr_sample.xls` — confirmed in this session to contain
the expected columns (`ID, Time, Call From, Call To, ...`) and IVR/Queue
labels (e.g. `IVR Duty Hours - AR_EN<6234>`) plus human agent labels
(e.g. `Abdelmagied Ali<7033>`), matching the direction-aware parsing rule.

## Idle break (Phase 5) — not yet built

- Exact threshold behavior: last activity 10:00, threshold detected 10:05,
  recorded break start 10:00, resumes 10:12, duration 12 minutes. 🚧

## Running what exists today

```bash
pnpm --filter @milaserv/validation test
pnpm --filter @milaserv/api test
```

`pnpm test` (repo-wide) runs both once every package has a `test` script;
currently `packages/database`, `packages/contracts`, `packages/ui`,
`apps/web`, and `apps/worker` have no tests yet.
