# apps/api-v2/Dockerfile · Imagen v2 paralela al Dockerfile v1 del root.
# Mirrors el patrón SOURCE_COMMIT del root Dockerfile para que A.5
# dual-verify funcione idéntico cuando esta imagen se deploye.
#
# Build: contexto = root del repo (no apps/api-v2/), porque pnpm
# necesita pnpm-workspace.yaml + packages/ accesibles.
#   docker build -f apps/api-v2/Dockerfile --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .
#
# Pre-requisito: pnpm-lock.yaml debe existir en el root (lo genera
# `pnpm install` post-merge del PR #1). Sin lockfile, este build falla
# en --frozen-lockfile, que es el comportamiento deseado para builds
# reproducibles.

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@9.15.0
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api-v2 ./apps/api-v2
# Los 5 packages workspace que api-v2 importa (ver apps/api-v2/package.json):
# config + contracts + db + auth + codes. Sin estos, `pnpm install` y el build
# (`@contan2/api-v2...` incluye sus deps) fallan. api-v2 sí depende de módulos
# nativos (sharp, @node-rs/argon2), pero ambos traen binarios PREBUILT para
# linux-{x64,arm64}-gnu (bookworm = glibc), así que NO hace falta toolchain
# (node-gyp/python) en la imagen: pnpm resuelve el binario por plataforma.
COPY packages/config ./packages/config
COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
COPY packages/auth ./packages/auth
COPY packages/codes ./packages/codes
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @contan2/api-v2... build

FROM base AS runtime
# Fuentes para el render de SVG→PNG (sharp/librsvg→pango→fontconfig): la
# credencial dibuja texto y sin fuentes sale en tofu (□□□). Mismo set que el
# Dockerfile v1 del root (fonts-inter = la familia que usa el badge;
# liberation = sustitutos métricos de Arial/Helvetica + Liberation Mono).
# + chromium para los PDFs de reportería (puppeteer-core usa el del sistema,
# igual que la imagen v1; PUPPETEER_EXECUTABLE_PATH default /usr/bin/chromium).
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-inter \
    fonts-liberation \
    chromium \
  && rm -rf /var/lib/apt/lists/*
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision="$SOURCE_COMMIT"
ENV BUILD_SHA="$SOURCE_COMMIT"
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/apps/api-v2/package.json ./apps/api-v2/
COPY --from=build /app/apps/api-v2/dist ./apps/api-v2/dist
COPY --from=build /app/packages/config/package.json ./packages/config/
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/auth/package.json ./packages/auth/
COPY --from=build /app/packages/auth/dist ./packages/auth/dist
COPY --from=build /app/packages/codes/package.json ./packages/codes/
COPY --from=build /app/packages/codes/dist ./packages/codes/dist
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/v2/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api-v2
CMD ["node", "dist/server.js"]
