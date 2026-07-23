# Local Setup

## Prerequisites

- Node.js >= 20, pnpm 10.x (`corepack enable` or `npm i -g pnpm`)
- Docker + Docker Compose (preferred), **or** a local PostgreSQL 16 and
  Redis 7 install if Docker/registry access is unavailable in your
  environment (this is how the API was verified in the sandbox that built
  Phase 0/1 — see `docs/implementation/IMPLEMENTATION_STATUS.md`)
- For the Windows companion (`apps/activity-agent`): Windows + .NET 8 SDK

## 1. Environment

```bash
cp .env.example .env
```

Fill in at minimum: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`DEVICE_TOKEN_SECRET`, `SEED_TEAM_LEADER_EMAIL`, `SEED_TEAM_LEADER_PASSWORD`.
Never commit `.env`.

## 2. Install dependencies

```bash
pnpm install
```

## 3. Start infrastructure

**Docker (preferred):**

```bash
docker compose up -d postgres redis
```

**Without Docker** (matches what was used to verify this repo so far):

```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE milaserv LOGIN PASSWORD 'change_me' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE milaserv_crm360 OWNER milaserv;"
redis-server --daemonize yes --port 6379
```

Make sure `DATABASE_URL` in `.env` matches whichever you chose.

## 4. Database

```bash
pnpm prisma:migrate     # applies packages/database/prisma/migrations
pnpm prisma:seed        # creates the initial Team Leader from .env
```

## 5. Run services

```bash
pnpm dev:api      # http://localhost:4000, Swagger at /docs
pnpm dev:web      # http://localhost:3000
pnpm dev:worker
```

## 6. Smoke test

```bash
curl http://localhost:4000/health

curl -c cookies.txt -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_TEAM_LEADER_EMAIL\",\"password\":\"$SEED_TEAM_LEADER_PASSWORD\"}"
```

You should get back a user object and an `accessToken`. Use it as
`Authorization: Bearer <token>` against `GET /users`.

## 7. Activity companion (Windows only)

```powershell
cd apps/activity-agent
$env:MILASERV_API_URL = "http://localhost:4000"
$env:MILASERV_ACCESS_TOKEN = "<a valid access token>"
dotnet run
```

This has not been build-verified outside a Windows environment — see
`apps/activity-agent/README.md`.
