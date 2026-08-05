# 2026-08-05 — 发布管线：Docker Hub 镜像 + CLI Release

首次对外发布：两个 Docker 镜像推送到 Docker Hub，CLI 通过 GitHub 云编译生成 Release（v0.1.0）。

## 本次完成

### 发布 workflow（`.github/workflows/`）
- `docker-publish.yml`：多架构（linux/amd64 + arm64）构建并推送 `zeroicey/serenique-{api,mcp}`。
  - tag `v*` → 推 `{version}`（0.1.0）、`v{version}`、`latest`；main push → 推 `main`；支持 `workflow_dispatch`。
  - 依赖 GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`（Docker Hub access token，Read&Write）。
- `release-cli.yml`：tag `v*` 时云编译 5 平台（对齐 `apps/cli/Makefile` 的 `build-all`：linux/darwin × amd64/arm64 + windows-amd64.exe），`sha256sum` 生成 checksums.txt，`gh release create --generate-notes`。ldflags 注入 `main.version=${GITHUB_REF_NAME}` / commit / date。`CGO_ENABLED=0` 静态编译。

### Dockerfile 安全加固（api + mcp）
| 问题 | 修复 |
|------|------|
| root 运行 | 固定 UID/GID **10001 非 root 用户**（`useradd`/`groupadd`，Debian 镜像无 `adduser`），`/data/blobs` chown 给该用户 |
| 镜像携带 dev 工具 | `bun install --omit=dev`（实测体积 api 438→380MB、mcp 488→401MB） |
| 无健康检查 | `HEALTHCHECK` 用内置 `bun fetch` 打 `/health`（两个服务都有 `/health` 路由；无 curl） |
| 无溯源信息 | OCI `org.opencontainers.image.source` 标签 |

### 其他
- 设置 GitHub secrets：`DOCKERHUB_USERNAME=zeroicey`、`DOCKERHUB_TOKEN`。
- 打 tag `v0.1.0` 并推送 → 两个 workflow 均 success。
- 本地 `serenique_blob-data` 卷一次性 chown 到 10001（5 个 blob 文件完好），保证 `docker compose up --build` 换新镜像后仍可写。

## 验证结果

- **Docker Hub**：`zeroicey/serenique-api` 与 `zeroicey/serenique-mcp` 各有 `latest` / `v0.1.0` / `0.1.0` / `main` 四个 tag，全部 amd64+arm64 双架构。
- **GitHub Release**：`v0.1.0` 已发布，资产 = checksums.txt + 5 个平台二进制。
- **镜像运行态**：本地冒烟 —— 两容器以 uid 10001 启动，`/health` 200，HEALTHCHECK 两容器均 `healthy`，blob 目录由 serenique 用户创建。
- **CLI 链路**：本地 `go test -count=1 ./...` 4 包全绿；5 平台交叉编译 OK；`--version` 正确注入 v0.1.0。

## 对下一次会话的提示（pitfalls）

- **bun 的 `--production` 会隐式冻结 lockfile**：`--filter` + `--production`（甚至在局部 workspace 下纯 `--production`）会报 `lockfile had changes, but lockfile is frozen`，即使没传 `--frozen-lockfile`。**生产安装一律用 `--omit=dev`**（行为相同但无此坑）。
- **`--frozen-lockfile` 只对完整 workspace 可用**：api 镜像用 `--filter @serenique/api`（构建上下文只有 api 清单，但 bun.lock 记录整个 workspace）必然 frozen 报错，必须省略 frozen；mcp 镜像（完整 workspace）可用 `--frozen-lockfile --omit=dev`，并充当 lockfile 新鲜度的闸门。原因已注释在 api Dockerfile 里，别"顺手补上"。
- **docker/metadata-action@v5 的 `enable={{is_tag}}` 会挂**：在 push 事件下解析成空字符串，报 `Invalid value for enable attribute`。改用 GitHub 原生表达式 `enable=${{ github.ref_type == 'tag' }}`（runner 先求值为 true/false 再交给 action）。
- **非 root 镜像 + 卷**：全新命名卷会继承镜像目录的属主（镜像里 chown 过即可）；**已存在的卷**需一次性 chown 到 10001（`docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`），否则容器写不进 `/data/blobs`。
- **本机发镜像需 Docker Desktop 登录 Docker Hub**：`~/.docker/config.json` 的 auths 是空的（desktop credsStore），`docker login` 非 TTY 不可交互；日常发布走 GitHub Actions，本机不需要登录。
- **gh（GitHub 登录）≠ Docker Hub 凭据**：推镜像要 Docker Hub 自己的 access token（`dckr_pat_*`），和 `gh auth` 无关。
- **GitHub Actions 构建网络正常**：runner 能直连 npm registry，Docker 构建无需本机那种 `--build-arg http_proxy` 注入。
- 新模块发布流程：改代码 → 提交推送 main（docker 出 `main` tag）→ 打 `vX.Y.Z` tag 推送（docker 出版本+latest、CLI 出 Release）。
