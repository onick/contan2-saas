# apps/web/Dockerfile · imagen del front v2 (Next standalone). Paralela a la de
# api-v2; build context = root del repo (pnpm workspace necesita
# pnpm-workspace.yaml + packages/ accesibles).
#   docker build -f apps/web/Dockerfile --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .
#
# `output: 'standalone'` (next.config.ts) emite un server autónomo con sus
# node_modules mínimos → la imagen runtime NO necesita pnpm install.

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS build
ARG SOURCE_COMMIT=unknown
ENV BUILD_SHA="$SOURCE_COMMIT"
ENV NEXT_TELEMETRY_DISABLED=1
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
# web solo importa @contan2/contracts del workspace (ver apps/web/package.json).
COPY packages/contracts ./packages/contracts
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @contan2/web... build

FROM base AS runtime
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision="$SOURCE_COMMIT"
ENV BUILD_SHA="$SOURCE_COMMIT"
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Next standalone (con outputFileTracingRoot=repo root): el server queda en
# apps/web/server.js y node_modules/packages al lado. static y public se copian
# aparte (no van en el trace).
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
