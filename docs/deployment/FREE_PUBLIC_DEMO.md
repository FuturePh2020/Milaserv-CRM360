# Free Public Demo

A way to put Milaserv CRM360 on the public internet, using **test data
only**, at zero hosting cost, for a short-lived demo/pilot walkthrough. This
is deliberately separate from `docs/deployment/PRODUCTION.md` - it trades
production concerns (backups, monitoring, real secrets, TLS certificate
management) for "runs on any machine with Docker, reachable by anyone with
the link, in under five minutes."

**Never use this for real patient, medical, identity, phone, insurance,
order, or CDR data.** Everything reachable through this setup should be
synthetic or drawn from the sample files in `docs/samples/`.

## What's different from local dev

| | Local dev (`docker-compose.yml`) | Demo (`docker-compose.demo.yml`) |
|---|---|---|
| Ports published to the host | Postgres 5432, Redis 6379, API 4000, Web 3000 (all directly reachable - convenient for debugging with a local client) | **Only** `gateway` on `127.0.0.1:8080` |
| Postgres / Redis | Directly reachable from the host | Internal Docker network only, never reachable from outside it |
| Browser ↔ API | Cross-port (`localhost:3000` → `localhost:4000`), CORS-enabled | Same-origin through the gateway (`/api/*`) - no CORS needed |
| `NEXT_PUBLIC_DEMO_MODE` | unset | `true` - shows the amber "DEMO ENVIRONMENT" banner and requires an explicit test-data confirmation before any file upload |

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- A copy of `.env` (copy from `.env.example` and fill in placeholder
  secrets - anything is fine for a demo, but don't reuse a real production
  secret here)
- `cloudflared` (Cloudflare's tunnel client) - no Cloudflare account needed
  for a Quick Tunnel. Install: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

## 2. Start the stack

```bash
cp .env.example .env
# edit .env: at minimum set a real SEED_TEAM_LEADER_EMAIL/PASSWORD,
# and change every "change_me*" secret to something random.

docker compose -f docker-compose.demo.yml up --build
```

This builds all four application images (`api`, `worker`, `web`, plus the
stock `postgres`/`redis`/`nginx` images) and starts everything on an
isolated Docker network. Only the `gateway` container's port
`127.0.0.1:8080` is reachable from the host - confirm this yourself:

```bash
curl http://localhost:8080/gateway-health   # -> "ok"
curl http://localhost:8080/api/health       # -> {"status":"ok"} (proxied to the API)
curl http://localhost:8080/                 # -> the login page HTML
```

## 3. Apply migrations and seed the initial Team Leader

The demo stack does not run migrations automatically (matching
`docker-compose.yml`'s existing behavior - see `PRODUCTION.md`'s Definition
of Done, which calls for reviewed migrations, not an auto-apply-on-boot
step). Run them once, inside the running `api` container:

```bash
docker compose -f docker-compose.demo.yml exec api npx prisma migrate deploy --schema=../../packages/database/prisma/schema.prisma
docker compose -f docker-compose.demo.yml exec api node -e "require('/repo/packages/database/prisma/seed.ts')" 2>/dev/null || \
  docker compose -f docker-compose.demo.yml run --rm \
    -e SEED_TEAM_LEADER_EMAIL="$SEED_TEAM_LEADER_EMAIL" \
    -e SEED_TEAM_LEADER_PASSWORD="$SEED_TEAM_LEADER_PASSWORD" \
    api sh -c "cd /repo/packages/database && node -r ts-node/register prisma/seed.ts"
```

(If the second command's `ts-node/register` path doesn't resolve in the
production image - it's a `devDependency` and the runtime image installs
`--prod` only - the more reliable option is to seed from your host machine
against the same database, using the same `pnpm --filter @milaserv/database
prisma:seed` command documented in `LOCAL_SETUP.md`, with `DATABASE_URL`
temporarily pointed at `postgresql://...@localhost:5432/...` after
forwarding the port with `docker compose -f docker-compose.demo.yml port
postgres 5432` - the demo stack intentionally doesn't publish that port by
default, so this is a deliberate one-time exception, not something to leave
open.)

Load the real sample files (`docs/samples/cash_leads.xlsx`,
`med_gulf_sample.xlsx`) through the Admin UI's import pages once logged in
- this is the "test data only" content the demo should actually show.

## 4. Put it on the public internet

Cloudflare Quick Tunnel needs no account, no DNS, no config file - it gives
you a random `https://*.trycloudflare.com` URL for as long as the process
stays running.

```bash
cloudflared tunnel --url http://localhost:8080
```

Output includes a line like:

```
+--------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-here.trycloudflare.com                                          |
+--------------------------------------------------------------------------------------+
```

Share that URL. It terminates TLS at Cloudflare's edge and forwards plain
HTTP to your `127.0.0.1:8080` gateway - the browser only ever sees HTTPS,
which is why the refresh-token cookie's `secure` flag (set when
`NODE_ENV=production`, which the demo compose file sets) works correctly.

**The tunnel exists only as long as the `cloudflared` process runs.** Kill
it (`Ctrl+C`) to take the demo offline instantly - there is no lingering
public exposure once that process exits, and no port stays open beyond
`127.0.0.1:8080`, which was never reachable from outside your machine in
the first place.

## 5. Tear down

```bash
docker compose -f docker-compose.demo.yml down        # stop and remove containers
docker compose -f docker-compose.demo.yml down -v      # also delete the demo's Postgres/Redis/upload volumes
```

The demo stack uses its own volume names (`milaserv_demo_*`) and its own
Compose project name (`milaserv-crm360-demo`), so it never touches a local
dev stack's data even if both are defined against the same `.env` file.

## Known limitations of this setup

- **No automatic migrations on boot** - by design, matching
  `docker-compose.yml`'s existing behavior; run them once as shown above.
- **No backup** of the demo database - it's disposable by design. Don't
  put anything in it you'd mind losing.
- **`docker compose build`/`up` for this file has not been executed
  end-to-end in this project's own sandbox** - the Docker daemon itself
  cannot start in the environment these Dockerfiles were authored in (see
  `docs/implementation/FINAL_REPOSITORY_AUDIT.md`), so `docker compose
  config` (syntax/interpolation validation, confirmed clean) is as far as
  this could be verified here. **Run the sequence in this document once on
  a host with a working Docker daemon before relying on it for a real
  demo**, and report back anything that doesn't match.
- **Single-instance only** - no horizontal scaling, no shared cache across
  replicas (the dashboard overview cache is in-process, see
  `IMPLEMENTATION_STATUS.md` Phase 10). Fine for a small demo audience, not
  for a real pilot's expected load.
