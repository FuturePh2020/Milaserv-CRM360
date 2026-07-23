# Architecture

## Overview

```
┌─────────────┐      HTTPS/WS       ┌──────────────┐
│  apps/web   │ ──────────────────▶ │   apps/api   │
│  (Next.js)  │ ◀────────────────── │  (NestJS)    │
│             │   REST + SSE/WS     └──────┬───────┘
│  in-tab     │   heartbeats              │
│  activity   │───────────────────────────▶│
│  tracker    │                            │
└─────────────┘                            │
                             ┌──────────────┼──────────────┐
                             ▼              ▼              ▼
                      ┌────────────┐ ┌────────────┐ ┌─────────────┐
                      │ PostgreSQL │ │   Redis    │ │ apps/worker │
                      │ (Prisma)   │ │  (BullMQ)  │ │  (BullMQ)   │
                      └────────────┘ └────────────┘ └─────────────┘
```

## Why these boundaries

- **API vs Worker**: imports (Cash/Insurance/CDR) can be large (the CDR sample
  alone is >13MB with tens of thousands of rows). The API accepts the upload,
  persists it, and enqueues a BullMQ job; the worker parses/normalizes/groups
  in the background so the request/response cycle stays fast and retry-safe.
  The API and worker share `packages/database` (Prisma) and
  `packages/validation` (phone/date/price parsing) so parsing logic is not
  duplicated or allowed to drift between "preview" (API) and "commit" (worker).

- **Contracts package has no server dependency**: `packages/contracts` holds
  enums, brand tokens, and disposition labels used by both `apps/web` and
  `apps/api`. It deliberately does not import Prisma, so the Next.js bundle
  never pulls in server-only code or a database driver.

- **Activity tracking is browser-based, with an accepted, explicit
  limitation**: an in-tab tracker resets an idle timer on any
  mouse/keyboard/scroll/touch event targeted at the CRM360 tab and reports
  idle duration to `POST /activity/heartbeat` on the Agent's own (already
  authenticated) session - no separate device token or native process. This
  supersedes the original spec's Windows-companion design (which used
  `GetLastInputInfo` for genuine device-wide idle detection). The trade-off
  is real and intentional: **a browser tab cannot observe activity outside
  itself** - an Agent working in another application with the CRM360 tab
  merely open in the background will be reported as idle. Admins can
  disable tracking per-Agent (for roles/situations where this false-idle
  risk isn't acceptable) and configure the global inactivity threshold from
  Settings. See `docs/architecture/SECURITY.md` for what the heartbeat
  payload does/doesn't contain.

## Request-time vs background-time responsibilities

| Concern | Where | Why |
|---|---|---|
| Login, RBAC, CRUD on users/teams/shifts | API (synchronous) | Low volume, needs immediate response |
| Generate Lead / Take Lead | API (synchronous, single DB transaction) | Must be atomic and return immediately to the Agent |
| Call Customer, dispositions | API (synchronous) | Same as above |
| Cash/Insurance import parsing, grouping, dedup | Worker (background job) | Can be tens of thousands of rows; must not block the request or the event loop |
| Yeastar CDR staging + relevant-match extraction | Worker (background job) | CDR files contain thousands of irrelevant rows; matching is a batch/indexed-join operation |
| Dashboard counters | API, reading from indexed/aggregated tables | Must stay responsive under the 15s auto-refresh cadence for ~200 concurrent users |

## Real-time updates

Preferred: WebSocket/SSE gateway in the API pushing targeted invalidation
events (e.g. "lead X changed", "team Y break counters changed") so the web
app only refetches what changed. Fallback: 15-second polling via React Query,
which is also the correctness backstop — the database transaction is always
the actual lock, never the refresh interval. This part of the API/web wiring
is scaffolded but the gateway itself lands in Phase 10 (dashboards).

## Timezone handling

All timestamps are stored in UTC (`DateTime` columns in Prisma map to
`timestamp` without timezone info attached at the app boundary; Postgres
`timestamptz` is used implicitly by Prisma's `DateTime`). Display conversion
to `Africa/Cairo` happens in the API response layer or the web app — never by
storing localized strings. CDR imports have their own explicit source-timezone
setting (`SystemSetting`) since the PBX record time is not in Cairo time by
default (`Asia/Riyadh` in the sample data).

## Concurrency-critical paths

`Generate Lead`, `Take Lead`, and the `No Answer / Busy` release rule are the
three flows where correctness depends on database-level locking rather than
application logic. See `docs/architecture/DATA_MODEL.md` for the exact
constraint design (`LeadAssignment.activeLeadMarker` /
`activeAgentMarker`) and Phase 6/7 test plans in
`docs/testing/TEST_PLAN.md` for how this is verified under concurrent load.

## Status

This document describes the target architecture. As of Phase 0/1, the API,
database schema, and worker skeleton exist and the described request/response
paths for auth are implemented and tested; import processing, lead
distribution, CDR matching, and the WebSocket/SSE gateway are not yet built —
see `docs/implementation/IMPLEMENTATION_STATUS.md`.
