# 本机 Docker 构建（API）

**坑**：构建容器无法直连 `registry.npmjs.org`（`ConnectionRefused`），直接 `docker build` 会在 `bun install` 阶段失败。

## 正确姿势

```sh
docker build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 \
  -t serenique-api -f services/api/Dockerfile .
```

`host.docker.internal:7897` 是宿主机本地 HTTP 代理（见本机 `http_proxy` 环境变量），端口变了就改。Docker 预定义代理 build-arg，无需改 Dockerfile。

## 运行

```sh
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -e BLOB_SIGNING_SECRET=<32+ chars> \
  -e AUTH_TOKEN=<32+ chars> \
  -v /host/path:/data/blobs \
  serenique-api
```

运行已构建好的镜像（`docker run`）不需要代理参数；env 键见 `.env.example`。

## 要点

- 仓库根为构建上下文（`-f services/api/Dockerfile .`）。
- 镜像生产安装用 `--omit=dev`（`--production` 会隐式冻结 lockfile 报错）。
- GitHub Actions 构建网络正常，无需代理注入。
- 本机发镜像需 Docker Desktop 登录 Docker Hub；日常发布走 CI（见 `release-process.md`）。
- MCP 已停更（`services/mcp`），本地只构建 `serenique-api`。
