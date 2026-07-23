# Free Public Demo — Cloud (Vercel + Render + Supabase + Upstash)

An alternative to `docs/deployment/FREE_PUBLIC_DEMO.md` (Docker Compose +
Cloudflare Quick Tunnel): this path uses only managed free tiers, so there
is no server to run yourself at all. **Config-only in this repository** -
none of this has been provisioned or deployed from this environment (no
Vercel/Render/Supabase/Upstash account or API token is available here).
Every file below is written and locally validated as far as possible
without those accounts; the actual `Deploy` clicks are yours to do.

**Test data only, same as the Docker demo path** - never put real patient,
medical, identity, phone, insurance, order, or CDR data through this.

## Topology

```
Browser ──HTTPS──▶ Vercel (apps/web, Next.js)
                       │ same-origin /api/* rewrite (next.config.mjs)
                       ▼
                   Render (apps/api + apps/worker embedded, one free
                   web service - see scripts/render-start.sh)
                       │
              ┌────────┴────────┐
              ▼                 ▼
        Supabase Postgres   Upstash Redis (TLS)
```

Same same-origin design as the Docker demo's Nginx gateway, just achieved
with Next.js's own `rewrites()` instead of a reverse-proxy container - the
browser never talks to Render directly, avoiding CORS entirely and letting
the refresh-token httpOnly cookie behave exactly like same-origin local dev.

## 1. Supabase (Postgres)

1. Create a free Supabase project.
2. Project Settings → Database → Connection string → copy the **URI**
   (Transaction pooler mode, port 6543, recommended for a serverless-style
   free web service that doesn't hold a persistent connection pool).
3. Append `?pgbouncer=true&connection_limit=5` (or similar - Supabase's
   pooler already manages the real pool; Prisma's own `connection_limit`
   here should stay small since Supabase's free tier caps total pooled
   connections across your whole project, not just this app).
4. **Storage (private bucket) - documented as a known follow-up, not
   implemented this pass**: the existing upload code
   (`apps/api/src/imports/imports.service.ts`) writes to local disk
   (`UPLOAD_STORAGE_PATH`), which works fine for the Docker demo's
   persistent volume but is wrong for Render's free tier (ephemeral disk -
   wiped on every deploy/restart). Wiring an actual Supabase Storage client
   (`@supabase/supabase-js`, a private bucket, signed URLs for
   preview/error-CSV downloads) is real engineering work beyond a
   config-only pass - `UPLOAD_STORAGE_PATH=/tmp/uploads` in
   `.env.render.example` is a stopgap that works for the lifetime of one
   running instance, not a durable fix. Do this before trusting the demo
   with anything you'd mind losing on a redeploy.
5. Apply migrations once you have the connection string - see step 4 below
   (Render's build command does this on every deploy automatically).

## 2. Upstash (Redis, TLS)

1. Create a free Upstash Redis database (any region close to your Render
   region choice).
2. Database details page → copy **Endpoint** (host) and **Password**.
   Upstash requires TLS - there is no plain-TCP option, matching
   `REDIS_TLS=true` already wired into `apps/worker/src/redis.ts` and
   `apps/api/src/imports/imports.service.ts` (both pass `tls: {}` to
   `ioredis` when this flag is set).

## 3. Render (API + embedded worker)

1. New → Blueprint → point at this repo/branch. Render reads the root
   `render.yaml` automatically.
2. **Root Directory**: repository root (blank/`.`) - a pnpm workspace needs
   the whole monorepo checked out to resolve `workspace:*` packages.
3. **Build Command** (from `render.yaml`, verbatim):
   ```
   corepack enable && corepack prepare pnpm@10.33.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @milaserv/database exec prisma generate && pnpm --filter @milaserv/database exec prisma migrate deploy && pnpm --filter @milaserv/contracts build && pnpm --filter @milaserv/validation build && pnpm --filter @milaserv/api build && pnpm --filter @milaserv/worker build
   ```
   This applies pending migrations on every deploy (there is no separate
   "release phase" step on Render's free tier) - reviewed migrations are
   still the rule (CLAUDE.md rule 8); this just means the review has to
   happen before merging to the deploy branch, not as a separate manual
   step after.
4. **Start Command**: `bash scripts/render-start.sh` - runs the BullMQ
   worker in the background and the API in the foreground (Render's free
   tier has no separate free background-worker service). See that script's
   comments for the accepted trade-off (no auto-restart of a crashed
   worker short of a full redeploy).
5. **Health Check Path**: `/health`
6. Fill in the environment variables from `.env.render.example` in the
   Render dashboard (`DATABASE_URL` from Supabase, `REDIS_HOST`/`REDIS_PASSWORD`
   from Upstash, `REDIS_TLS=true`, `CORS_ORIGIN` to your Vercel URL once you
   have it, `SEED_TEAM_LEADER_EMAIL`/`PASSWORD`). Let Render generate
   `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` rather than pasting your own.
7. First deploy: after it goes live, seed the initial Team Leader once,
   from your own machine, pointed at the Supabase connection string:
   ```bash
   DATABASE_URL="<the same Supabase URL>" \
   SEED_TEAM_LEADER_EMAIL="<from render env>" \
   SEED_TEAM_LEADER_PASSWORD="<from render env>" \
   pnpm --filter @milaserv/database prisma:seed
   ```

## 4. Vercel (web)

1. New Project → import this repo.
2. **Root Directory**: `apps/web` (Vercel monorepo convention - this is
   where `apps/web/vercel.json` lives).
3. Vercel reads `apps/web/vercel.json`'s `buildCommand` automatically
   (verbatim):
   ```
   cd ../.. && corepack enable && corepack prepare pnpm@10.33.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @milaserv/contracts build && pnpm --filter @milaserv/web build
   ```
   (`apps/web` depends only on `@milaserv/contracts` and `@milaserv/ui` -
   `ui` stays as raw TypeScript source, transpiled by Next.js itself via
   `transpilePackages`, so it needs no separate build step. Neither
   `@milaserv/database` nor `@milaserv/validation` is a web dependency, so
   no Prisma/database step is needed in this build at all.)
4. Environment variables (from `.env.vercel.example`): `NEXT_PUBLIC_API_URL=/api`,
   `API_ORIGIN=<your Render URL>`, `NEXT_PUBLIC_DEMO_MODE=true`.
5. Once deployed, go back to Render and set `CORS_ORIGIN` to the real
   Vercel URL (same-origin traffic through the `/api` rewrite doesn't
   strictly need this, but keep it correct for any direct-to-API request).

## Known limitations

- **Upload storage is not durable** - see the Supabase Storage note above.
  Fine for a short demo session; redeploying Render (which happens on
  every push to the deploy branch) wipes anything uploaded since the last
  deploy.
- **The embedded worker has no independent health monitoring** - Render
  only health-checks the API's `/health`. If the worker process dies but
  the API keeps running, imports/CDR processing silently stop working
  until the next deploy. Acceptable for a demo; not for a real pilot.
- **Render free tier sleeps on inactivity** and takes tens of seconds to
  wake on the next request - the first request after a period of no
  traffic will be slow. Not a bug, a free-tier characteristic.
- **None of this has actually been deployed or tested against real
  Vercel/Render/Supabase/Upstash infrastructure from this repository** -
  every command in this document was validated by running the *identical*
  command sequence locally (see `docs/testing/FINAL_COMMAND_RESULTS.md`)
  against a local Postgres/Redis standing in for Supabase/Upstash, and the
  Render start script was verified to correctly bind `$PORT` and answer
  `/health`. The actual cloud accounts, DNS, and first real deploy are a
  step only you can complete.
