# API DaLan OS: build toàn monorepo rồi chạy apps/api/dist/main.js
FROM node:24-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY data ./data
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dalan/domain --filter @dalan/contracts --filter @dalan/db --filter @dalan/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "apps/api/dist/main.js"]
