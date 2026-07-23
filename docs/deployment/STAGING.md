# Staging Deployment

> Status: documented target process. Not yet exercised end-to-end (no staging
> environment has been provisioned as part of this work). Treat as a plan to
> validate, not a proven runbook, until it has actually been run once.

## Topology

Single Docker Compose host is sufficient for staging load (well below the
200-concurrent-user production target):

- `postgres`, `redis`, `api`, `worker`, `web` — all defined in the root
  `docker-compose.yml`.
- A reverse proxy (Caddy/Nginx/Traefik — not included in this repo) in front
  of `web` (port 3000) and `api` (port 4000) terminating TLS.

## Deploy steps

1. Provision the host, install Docker + Docker Compose.
2. Copy `.env.example` to `.env` on the host, fill in staging secrets
   (different from local/production secrets — never reuse).
3. `docker compose pull && docker compose build`
4. `docker compose run --rm api pnpm --filter @milaserv/database prisma:migrate:deploy`
   (uses `prisma migrate deploy`, which applies pending migrations without
   prompting — safe for non-interactive environments, never generates new
   migrations).
5. `docker compose run --rm api pnpm --filter @milaserv/database prisma:seed`
   (idempotent — safe to re-run).
6. `docker compose up -d`
7. Verify: `curl https://staging-host/api/health`, then log in with the
   seeded Team Leader account and confirm the Admin dashboard loads.

## Configuration differences from local

- `NODE_ENV=production` (enables `secure` cookies).
- `CORS_ORIGIN` set to the actual staging web origin.
- `AUTH_COOKIE_DOMAIN` set to the staging domain.
- Secrets generated fresh, not copied from `.env.example`.

## What staging is for

- UAT (`docs/release/UAT.md`).
- Verifying the Windows activity companion against a real reachable API
  before pilot rollout (`docs/release/PILOT_MONITORING.md`).
- Load/concurrency testing described in `docs/testing/TEST_PLAN.md` before
  hitting production.
