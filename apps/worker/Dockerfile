# See apps/api/Dockerfile for the rationale behind the full-workspace-context
# build (docker-compose.yml sets `context: .`).

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
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
RUN pnpm --filter @milaserv/database build
RUN pnpm --filter @milaserv/contracts build
RUN pnpm --filter @milaserv/validation build
RUN pnpm --filter @milaserv/worker build

FROM node:20-alpine AS runtime
RUN apk add --no-cache python3 make g++ \
  && corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/packages/database/generated ./packages/database/generated
COPY --from=build /repo/packages/database/prisma ./packages/database/prisma
COPY --from=build /repo/packages/contracts/src ./packages/contracts/src
COPY --from=build /repo/packages/validation/dist ./packages/validation/dist

WORKDIR /repo/apps/worker
CMD ["node", "dist/main.js"]
