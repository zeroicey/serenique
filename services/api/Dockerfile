FROM oven/bun:1

# ---- Timezone (UTC+8) ----------------------------------------------------------
# 日记「今天」等按服务器本地日期判定（见 .ai/worklog/2026-08-08-api-diary-today-local.md），
# 需 tzdata + TZ 让容器本地时区 = 用户时区（UTC+8）。
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

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

# Workspace manifests first, for layer caching. apps/web is a workspace member
# (root package.json workspaces: ["services/*", "apps/web"]); its package.json
# must be present for bun install to validate the workspace, even though this
# image only builds/installs @serenique/api.
COPY package.json bun.lock tsconfig.base.json ./
COPY scripts/docker-entrypoint.sh scripts/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/

# Production deps only — no dev tooling in the image.
# Note: --frozen-lockfile is deliberately omitted here. With a --filter install
# the build context carries only services/api, but bun.lock covers the whole
# workspace, so bun reports a spurious lockfile diff and fails. --omit=dev is
# used instead of the equivalent --production because bun treats --production
# as implying a frozen lockfile and errors for the same reason. The committed
# lockfile still pins resolved versions; the MCP image (full workspace)
# installs with --frozen-lockfile and acts as the lockfile freshness gate.
RUN bun install --filter @serenique/api --omit=dev

COPY --chown=10001:10001 services/api/ services/api/

WORKDIR /app/services/api

USER serenique

ENV PORT=3000
ENV NODE_ENV=production
ENV BLOB_ROOT=/data/blobs
ENV BLOB_MAX_SIZE=104857600

LABEL org.opencontainers.image.source="https://github.com/zeroicey/serenique"
LABEL org.opencontainers.image.description="Serenique REST API (Bun + Hono + PostgreSQL)"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["sh", "/app/scripts/docker-entrypoint.sh", "bun", "run", "start"]
