FROM oven/bun:1

WORKDIR /app

# Workspace config — copy root + both service manifests for layer caching
COPY package.json bun.lock tsconfig.base.json ./
COPY scripts/docker-entrypoint.sh scripts/
COPY services/api/package.json services/api/
COPY services/mcp/package.json services/mcp/

RUN bun install

# MCP depends on API source code (workspace:* references TS files directly)
COPY services/api/ services/api/
COPY services/mcp/ services/mcp/

WORKDIR /app/services/mcp

ENV NODE_ENV=production
ENV BLOB_ROOT=/data/blobs
ENV BLOB_MAX_SIZE=104857600
ENV MCP_TRANSPORT=streamable-http
ENV PORT=3001

EXPOSE 3001

CMD ["sh", "/app/scripts/docker-entrypoint.sh", "bun", "run", "start"]
