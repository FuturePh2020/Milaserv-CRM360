# See apps/api/Dockerfile for the rationale behind the full-workspace-context
# build (docker-compose.yml sets `context: .`).
#
# NEXT_PUBLIC_* values are inlined into the client bundle at *build* time,
# not read at container runtime - both are passed as build args so a demo
# deployment (behind the Nginx gateway, NEXT_PUBLIC_API_URL=/api) and a
# plain local deployment (NEXT_PUBLIC_API_URL=http://localhost:4000) can
# build the same Dockerfile with different values.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN apk add --no-cache python3 make g++
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
# Only the Docker build wants Next.js standalone output - see
# next.config.mjs for why Vercel must not get this.
ENV BUILD_STANDALONE=true
RUN pnpm --filter @milaserv/database build
RUN pnpm --filter @milaserv/contracts build
RUN pnpm --filter @milaserv/validation build
RUN pnpm --filter @milaserv/web build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output: a self-contained server.js plus only the
# node_modules this app actually needs, traced at build time. Static
# assets and the public/ folder are not part of standalone output and are
# copied in separately (a well-known standalone-mode requirement).
COPY --from=build /repo/apps/web/.next/standalone/apps/web ./
COPY --from=build /repo/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=build /repo/apps/web/.next/static ./.next/static
COPY --from=build /repo/apps/web/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
