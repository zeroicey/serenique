# 本机 Docker 构建（API / MCP）

**坑**：构建容器无法直连 `registry.npmjs.org`（`ConnectionRefused`），`docker compose build` 会失败。

## 正确姿势

```sh
docker compose build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 api mcp
```

`host.docker.internal:7897` 是宿主机本地 HTTP 代理（见本机 `http_proxy` 环境变量），端口变了就改。Docker 预定义代理 build-arg，无需改 Dockerfile。

## 要点

- `docker compose up -d`（不 build）不需要代理参数。
- 手动构建：`docker build -t serenique-api -f services/api/Dockerfile .`（仓库根为构建上下文）。
- 镜像生产安装用 `--omit=dev`（`--production` 会隐式冻结 lockfile 报错）。
- GitHub Actions 构建网络正常，无需代理注入。
- 本机发镜像需 Docker Desktop 登录 Docker Hub；日常发布走 CI（见 `release-process.md`）。
