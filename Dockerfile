# ──────────────────────────────────────────────
# MCP Bearer Proxy — Next.js (standalone output)
# Multi-stage build: deps → build → runtime
# ──────────────────────────────────────────────

# ---------- Stage 1: install dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- Stage 2: build the app ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- Stage 3: minimal runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8787 \
    HOSTNAME=0.0.0.0 \
    DATA_FILE=/data/servers.json

# wget is used by the healthcheck
RUN apk add --no-cache wget

# Run as non-root for better security
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Ensure data directory exists and is writable by the node user
RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 8787

CMD ["node", "server.js"]
