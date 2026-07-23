# Operations Runbook

> Status: template for production operation. Populate the on-call/escalation
> details before pilot go-live per `docs/release/PILOT_MONITORING.md`.

## Services and what "healthy" means

| Service | Health check | Failure symptom |
|---|---|---|
| `api` | `GET /health` returns `{"status":"ok"}` | Agents cannot log in or Generate Lead |
| `worker` | Process alive, BullMQ queue depth not growing unbounded | Imports/CDR stuck in `PROCESSING` |
| `postgres` | Accepts connections, replication lag (if any) within bounds | Everything fails |
| `redis` | `PING` → `PONG` | Background jobs cannot be enqueued/consumed |
| `web` | Loads login page | Users cannot reach the app at all |

## Common incidents

### Imports stuck in PROCESSING

1. Check worker logs for the failing job id.
2. Check BullMQ failed-job list (`LeadImportBatch.status`); retry is safe —
   imports are designed to be idempotent (re-processing does not duplicate
   leads, per `docs/architecture/DATA_MODEL.md` grouping-key design).
3. If the root cause is a bad file (unexpected columns, wrong date format
   selected), the batch's error rows/`LeadImportError` should already explain
   why — do not manually edit lead data to route around it.

### A lead appears "stuck" with an active owner who is no longer working it

1. Check `LeadAssignment` for the active row (`activeLeadMarker` non-null).
2. Prefer the in-app "release with reason" action (Team Leader/Shift
   Supervisor) over any direct database edit — this preserves the audit
   trail per the non-negotiable rules in `CLAUDE.md`.
3. Never manually null out `activeLeadMarker`/`activeAgentMarker` via SQL —
   it bypasses the audit trail and status history and risks violating the
   partial-unique-index invariant described in `docs/architecture/DATA_MODEL.md`.

### Suspected duplicate CDR/lead records after a re-upload

1. Confirm idempotency keys: `LeadImportFile.checksumSha256` for whole-file
   re-uploads, `CdrRecord.cdrRecordId` for CDR rows, `Lead.groupKey` for lead
   grouping.
2. If a genuine duplicate exists, it indicates an idempotency-key bug —
   treat as a defect to fix at the source, not something to clean up
   ad-hoc in production without also fixing the root cause.

### Account lockouts during a support call

- Team Leader can inspect `User.lockedUntil`/`failedLoginCount` state; there
  is currently no dedicated "unlock" endpoint (tracked as outstanding — add
  one before relying on lockouts operationally at scale, since right now
  unlocking requires waiting out `AUTH_LOCKOUT_DURATION_MINUTES` or a direct
  DB update by an operator with access, which should itself be audited).

## Rotating secrets

See `docs/deployment/PRODUCTION.md` — rotating `JWT_ACCESS_SECRET` or
`JWT_REFRESH_SECRET` invalidates every existing session/refresh token.
Communicate this to users before rotating in production.

## Escalation

Fill in for your organization: on-call contact, severity definitions,
paging thresholds. Not populated here since it's organizational, not
technical.
