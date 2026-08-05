FROM oven/bun:1

# ---- Non-root runtime user --------------------------------------------------
# Fixed UID/GID (10001) so the /data/blobs volume can be chowned to match once.
# A fresh named volume inherits the image's ownership; a host bind mount must
# be writable by UID 10001.
ENV HOME=/home/serenique

RUN groupadd --gid 10001 serenique \
  && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/serenique \
    --shell /usr/sbin/nologin serenique \
  && mkdir -p /data/blobs \
  && chown -R serenique:serenique /home/serenique /data/blobs

WORKDIR /app

# Workspace manifests first, for layer caching
COPY package.json bun.lock tsconfig.base.json ./
COPY scripts/docker-entrypoint.sh scripts/
COPY services/api/package.json services/api/
COPY services/mcp/package.json services/mcp/

# Production deps only, pinned to bun.lock — no dev tooling in the image
RUN bun install --frozen-lockfile --omit=dev

# MCP depends on the API workspace package (workspace:* → symlink to services/api)
COPY --chown=10001:10001 services/api/ services/api/
COPY --chown=10001:10001 services/mcp/ services/mcp/

WORKDIR /app/services/mcp

USER serenique

ENV NODE_ENV=production
ENV BLOB_ROOT=/data/blobs
ENV BLOB_MAX_SIZE=104857600
ENV MCP_TRANSPORT=streamable-http
ENV PORT=3001

LABEL org.opencontainers.image.source="https://github.com/zeroicey/serenique"
LABEL org.opencontainers.image.description="Serenique MCP server (streamable-http)"

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["sh", "/app/scripts/docker-entrypoint.sh", "bun", "run", "start"]
