FROM node:20-bookworm-slim AS base

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
