# Milaserv CRM360

Telesales Leads Distributor — sessions, breaks, Cash/Insurance lead imports,
atomic lead distribution, dispositions, Yeastar CDR matching, and reporting.

This is a standalone project. It does not depend on, import from, or share
infrastructure with any previous Milaserv 360 repository.

See `docs/specifications/MILASERV_CRM360_MVP.md` for the full product and
engineering specification this project implements, and
`docs/implementation/IMPLEMENTATION_STATUS.md` for what is built versus
outstanding right now.

## Stack

- **Web**: Next.js, TypeScript, Tailwind CSS, React Query
- **API**: NestJS, TypeScript, REST + Swagger, WebSocket/SSE
- **Database**: PostgreSQL via Prisma ORM
- **Background jobs**: Redis + BullMQ
- **Activity tracking**: browser-based (tab focus + interaction heartbeats),
  Admin-configurable per Agent - see the note below
- **Infra**: Docker Compose for local/staging

## Monorepo layout

```
apps/
  web/              Next.js frontend (Admin + Agent dashboards)
  api/              NestJS REST API
  worker/           BullMQ background workers (imports, CDR matching)
packages/
  database/         Prisma schema, migrations, generated client
  contracts/        Shared enums/types/brand tokens (no server deps)
  validation/        Phone/date/price parsing shared by API and worker
  ui/               Shared design tokens
  config/           Shared tsconfig bases
docs/               Specifications, architecture, implementation, deployment, testing, release docs
```

## Activity tracking

Idle detection is browser-based: a tracker running in the Agent's active tab
resets an idle timer on any interaction (mouse/keyboard/scroll/touch) and
reports idle duration to the API on a heartbeat. This is a deliberate
architecture decision (superseding the earlier Windows-companion design) -
**it can only see activity within the browser tab**, not the whole device.
An Agent active in another application with the CRM360 tab merely open in
the background will still be reported as idle. Admins can enable/disable
tracking per Agent and set the global inactivity threshold from Settings.
See `docs/architecture/ARCHITECTURE.md` for the full rationale and
limitation.

## Getting started (local development)

See `docs/deployment/LOCAL_SETUP.md` for full instructions. Summary:

```bash
cp .env.example .env        # fill in real secrets
pnpm install
docker compose up -d postgres redis
pnpm prisma:migrate
pnpm prisma:seed            # creates the initial Team Leader from .env
pnpm dev:api                # http://localhost:4000  (Swagger at /docs)
pnpm dev:web                # http://localhost:3000
pnpm dev:worker
```

## Quality gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Documentation index

- `docs/architecture/ARCHITECTURE.md` — system architecture
- `docs/architecture/DATA_MODEL.md` — database model and constraints
- `docs/architecture/SECURITY.md` — authz, masking, upload/device security
- `docs/implementation/IMPLEMENTATION_PLAN.md` — phased build plan
- `docs/implementation/IMPLEMENTATION_STATUS.md` — current status, honestly
- `docs/deployment/LOCAL_SETUP.md`, `STAGING.md`, `PRODUCTION.md`
- `docs/testing/TEST_PLAN.md`
- `docs/release/UAT.md`, `OPERATIONS_RUNBOOK.md`, `ROLLBACK.md`, `PILOT_MONITORING.md`
