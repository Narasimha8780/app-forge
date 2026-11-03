# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f admin/Dockerfile .
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node config ./config
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node admin ./admin
COPY --chown=node:node public/favicon.svg ./public/favicon.svg
USER node
EXPOSE 8080
CMD ["node", "admin/server.js"]
