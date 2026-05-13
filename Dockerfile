FROM node:20-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-inter \
    libvips \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm ci --omit=dev

WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /app/backend/data/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/dashboard/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
