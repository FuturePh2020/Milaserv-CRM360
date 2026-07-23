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
- **Activity companion**: .NET Windows console app (device-wide idle detection)
- **Infra**: Docker Compose for local/staging

## Monorepo layout

```
apps/
  web/              Next.js frontend (Admin + Agent dashboards)
  api/              NestJS REST API
  worker/           BullMQ background workers (imports, CDR matching)
  activity-agent/   Windows companion (idle detection, heartbeats)
packages/
  database/         Prisma schema, migrations, generated client
  contracts/        Shared enums/types/brand tokens (no server deps)
  validation/        Phone/date/price parsing shared by API and worker
  ui/               Shared design tokens
  config/           Shared tsconfig bases
docs/               Specifications, architecture, implementation, deployment, testing, release docs
```

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
