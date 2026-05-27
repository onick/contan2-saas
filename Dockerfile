# Node 20 alcanzó EOL 2026-04-30 — usamos Node 24 (current LTS al cierre de
# FASE 1.A). Compat verificada: sharp ≥0.34, @node-rs/argon2 ≥2.0.2,
# puppeteer-core ≥24, pg ≥8.20 — todos publican binaries N-API para Node 24.
FROM node:24-bookworm-slim AS base

# Identidad de build (commit git). Coolify lo inyecta vía --build-arg
# GIT_SHA=$(git rev-parse HEAD) automáticamente cuando configurás
# "Inject build args" en la app, o se puede setear manualmente con
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) .
# Si no se pasa, queda 'unknown' y el endpoint /api/version lo expone como
# tal — eso señala al operador que el deploy no fue trazable y el runbook
# 06 lo trata como "abortar antes de B" (ver Paso A.5).
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision="$GIT_SHA"
ENV BUILD_SHA="$GIT_SHA"

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
