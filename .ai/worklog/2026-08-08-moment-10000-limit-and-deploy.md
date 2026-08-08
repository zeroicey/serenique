# 2026-08-08 — moment 字数限制 500 → 10000（四端）+ 生产部署事故复盘

用户反馈闪记 500 字不够写，保存超长内容时报「参数校验失败」（`handleError` 把 zod `ZodError` 转成 message「参数校验失败」，移动端 `humanizeError` 透传——用户看到的「参数效应失败」就是它）。四端同步放宽到 10000，并部署生产 + 重装手机。

## 改动（commit 5f543b1）

- **API**：`moment.types.ts` `CreateMomentSchema` / `UpdateMomentSchema` `max(500)` → `max(10000)`；测试 501 → 10001 用例。
- **移动端**：`moment_create_page.dart` `maxLength: 500` → `10000`（创建页输入上限；详情页编辑框本就无上限）。
- **Web**：`schemas.ts` `.max(500)` → `.max(10000)` + 测试。
- **CLI**：`cmd/moment.go` create/edit 帮助与 flag 文案 500 → 10000；`internal/client/moment.go` 注释同步。

验证：api `bun test` 122 pass、web vitest 151 pass、CLI go 全过、flutter analyze/test 91 pass、typecheck 通过。

## 生产部署事故：registry mirror 缓存旧 tag（重点坑）

**现象**：推送 `5f543b1` → CI 构建成功（digest `sha256:368745…`）→ 服务器 `docker pull zeroicey/serenique-api:main` 返回「Image is up to date」，`docker compose up -d --force-recreate api` 后 PUT 2000 字仍报 `"maximum":500`——跑的还是旧代码。

**根因**：hpcore 的 `/etc/docker/daemon.json` 配了 3 个 Docker Hub 镜像加速器（xuanyuan），**加速器对 `:main` tag 缓存了旧镜像**，pull 命中缓存拿到旧 digest（`e752b8af97ca`，上一轮构建），CI 新推的 `:main`（`368745…`）没被加速器同步。

**修复**：**用 digest 精确拉取绕过 tag 缓存**：
```sh
docker pull zeroicey/serenique-api@sha256:36874566636bd5ace114cb52cb363be836bf0e6b1c3ac2d6424ae20b38b8398f
docker tag zeroicey/serenique-api@sha256:368745… zeroicey/serenique-api:latest
docker compose up -d --force-recreate api
```
- CI 的 digest 从 `gh run view <run> --log | grep containerimage.digest` 拿。
- **验证部署是否生效**：`docker inspect <container> --format '{{.Image}}'` 对比期望 digest；业务侧用真实请求验证（如 PUT 2000 字 → 应过校验返回 404「闪念不存在」）。
- 服务器/本机直连 `registry-1.docker.io` 都超时（本网络 Docker Hub 需加速器/代理），`docker manifest inspect` 不可用。

**对下一次会话的提示**：
1. **hpcore 部署 docker pull 后必须核对 digest**：`docker inspect zeroicey/serenique-api:main --format '{{.RepoDigests}}'` 与 `gh run view --log` 的 `containerimage.digest` 一致才说明拿到新镜像；不一致 = 加速器缓存，用 digest 拉取。
2. `docker compose up -d` 若输出「Container Running」而非「Recreated」= 容器没换镜像，需 `--force-recreate`。
3. 手机重装固定流程：`flutter build ios --release --dart-define=API_BASE_URL=https://api.zeroicey.me` + `xcrun devicectl device install app --device C11AB076-C53F-5679-AE4E-FD16821ABCCC build/ios/iphoneos/Runner.app`。**绝不用 debug 构建装真机**（iOS 禁 JIT，独立点击闪退）。

## 验证结果

- 生产：2000 字 PUT → 通过校验 → 404「闪念不存在」；10001 字 → `"maximum":10000` VALIDATION。✅
- 手机：release 新版已装并启动成功（含创建页 10000 上限）。
