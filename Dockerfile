# Node 22 for the built-in SQLite driver — it means no native module to compile,
# so this image builds on arm64 (a Raspberry Pi) as fast as on x86.
FROM node:22-alpine

WORKDIR /app

# Install production dependencies first so the layer caches across code changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server ./server
COPY web ./web

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PC_HOST=0.0.0.0 \
    PC_PORT=8080 \
    PC_DB=/app/data/powercord.db

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
