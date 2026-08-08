# 发布流程（tag → CI → 部署）

## 两步发布

```sh
# 1. 提交并推 main → docker-publish 出 zeroicey/serenique-{api,mcp}:main
git push origin main

# 2. 打 tag 推 → docker-publish 出版本+latest，release-cli 出 GitHub Release
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## 流程细节

- `--version` 从 git tag 注入（`git describe --tags` / `GITHUB_REF_NAME`），**tag 是发布前提**。
- `.github/workflows/docker-publish.yml`：多架构（linux/amd64+arm64）。tag `v*` → `{version}`/`v{version}`/`latest`；main push → `main`。
- `.github/workflows/release-cli.yml`：tag 时云编译 5 平台 + `checksums.txt` + `gh release create --generate-notes`。
- Docker Hub 命名空间 `zeroicey`；secrets：`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`（Docker Hub access token，**与 gh 的 GitHub 登录无关**）。
- 本机推 GitHub 要代理：`https_proxy=http://127.0.0.1:7897 git push …`（直连 receive-pack 超时）。
- 镜像非 root（UID 10001）：全新命名卷自动继承属主；**旧卷需一次性** `docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`，否则容器写不进 `/data/blobs`。

## 发布前验证

- `bun run typecheck`（api+mcp+web 全绿）
- `cd services/api && bun test`（单元全过）
- `cd apps/cli && go test -count=1 ./...`；`make build-all`（或靠 CI 云编译）

## 坑（workflow 配置）

- bun `--production` 隐式冻结 lockfile：生产安装一律 `--omit=dev`。
- `--frozen-lockfile` 只对完整 workspace 可用（api 镜像 `--filter` 必须省略）。
- `docker/metadata-action@v5` 的 `enable={{is_tag}}` 会挂，用 `enable=${{ github.ref_type == 'tag' }}`。

## 部署

- 服务器侧部署见 `hpcore-deploy.md`（digest 校验、`--force-recreate`）。
- 发布后验证：`https://api.zeroicey.me/health` → `{"status":"ok"}`；`/` 的 modules 列表含新模块。
