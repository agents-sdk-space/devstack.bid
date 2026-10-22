# DevStack build container: runs ONE customer build per instance (Cloudflare Containers).
# No secrets, no build ARGs: the GitHub token and env vars arrive per request and live only in memory.
# Digests pinned 2026-10-22 (re-pin when bumping).
FROM oven/bun:1-slim@sha256:14a223fa35747ec728bce300ef85888bc5f7958164d15bbba6a54b22b52a3288 AS bun

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV CI=1 NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_ENV=production PORT=8080
WORKDIR /work
COPY --chown=node:node build-server.mjs /opt/devstack/build-server.mjs
RUN chown node:node /work
USER node
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/opt/devstack/build-server.mjs"]
