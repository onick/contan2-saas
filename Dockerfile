# Node 20 alcanzó EOL 2026-04-30 — usamos Node 24 (current LTS al cierre de
# FASE 1.A). Compat verificada: sharp ≥0.34, @node-rs/argon2 ≥2.0.2,
# puppeteer-core ≥24, pg ≥8.20 — todos publican binaries N-API para Node 24.
FROM node:24-bookworm-slim AS base

# Identidad de build (commit git).
#
# Coolify expone el commit del último deploy git-based como variable
# `SOURCE_COMMIT` durante el build, **siempre que la app tenga activado
# "Include Source Commit in Build"** (Application Settings → Build).
# Sin esa opción, el build no recibe `SOURCE_COMMIT` y `BUILD_SHA` queda
# en 'unknown' — eso señala al operador que el deploy no fue trazable y
# el runbook 06 lo trata como "abortar antes de B" (ver Paso A.5).
#
# Build manual (fuera de Coolify):
#   docker build --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .
#
# Mantenemos `BUILD_SHA` como nombre de la env var al runtime para que el
# código Node no dependa de la nomenclatura del proveedor de CI/CD.
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision="$SOURCE_COMMIT"
ENV BUILD_SHA="$SOURCE_COMMIT"

# Chromium + deps mínimos para PDF rendering vía puppeteer-core.
# Debian gestiona los dependentes del paquete chromium automáticamente.
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-inter \
    fonts-liberation \
    fonts-noto-color-emoji \
    libvips \
    ca-certificates \
    chromium \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/

WORKDIR /app/backend
# Evita que puppeteer-core intente descargar su Chromium bundleado;
# usamos el del sistema instalado por apt arriba.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev

WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /app/backend/data/uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000

WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
