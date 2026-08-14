# 2026-08-15 — API 安全中间件（限流/安全头/CSRF/体积/超时）+ 全仓 Biome 迁移 + 双端部署

三件事同批完成：① services/api 挂上 5 个安全中间件；② lint/format 从 eslint+prettier 迁移到 Biome；③ 前端 Pages + 后端 hpcore 部署上线（含线上冒烟发现并修复的一个 500 问题）。

## 一、API 安全中间件（feat(api): add security middleware…）

`services/api/src/middleware/` 新增 5 个工厂函数（沿用项目风格：单文件单工厂、中文注释、`middleware/index.ts` 导出、app.ts 按序挂载）：

| 中间件 | 实现 | 关键决策 |
|--------|------|----------|
| `rate-limit.ts` | hono-rate-limiter + MemoryStore | 默认 100 次/分/IP（`RATE_LIMIT_MAX`）；**/health 豁免**（Docker HEALTHCHECK + 监控每 30s 探活）；`NODE_ENV=test` 整体跳过（bun test 单进程共享模块缓存，全量单测请求数会误触发限流）；keyGenerator 取 X-Forwarded-For 首跳，无代理头回退 "local"；429 统一信封 |
| `secure-headers.ts` | hono 内置 | **CORP 必须放宽为 cross-origin**——默认 same-origin 会拦截 Web 前端跨域 `<img>` 加载 blob 预览（no-cors 请求）；其余默认（HSTS/nosniff/X-Frame-Options…）；不启用 CSP（API 无 HTML 渲染面） |
| `csrf.ts` | hono/csrf 封装 | hono/csrf 只拦**表单类**不安全方法（multipart/urlencoded/text-plain，JSON 由 CORS 预检负责）；**无 Origin 头（CLI/curl/MCP）直接放行**——hono/csrf 对无 Origin 的表单请求也会 403，必须包一层跳过；白名单 = `CORS_ORIGIN` + `WEBAUTHN_ORIGINS`（与 ai.router.ts 的 WS 门禁同源）；**403 要转统一信封**（见下方部署后修复） |
| `body-limit.ts` | hono 内置 | 上限 = max(`BODY_LIMIT_MAX_SIZE` 默认 100MB, `BLOB_MAX_SIZE` + 1MB 余量)——100MB blob 上传 + multipart 信封开销不被误杀；文件大小由 blob.service.assertBlobSize 把关；413 统一信封 |
| `timeout.ts` | hono 内置 | 默认 60s（`HTTP_TIMEOUT_MS`）；**/api/ai/\* 豁免**（AI WS 流式链路绝不干扰） |

env.ts 新增 3 个键全部 `optional()` + 中间件内 `??` 回退（沿用 SESSION_TTL 的既有模式——`default()` 会让 Env 类型变成必填，app.test.ts / 集成测试的显式 env 会 TS 报错）。**生产 .env 零改动**。单测 `middleware.test.ts` 覆盖限流 429//health 豁免、CSRF 403/放行/JSON 放行、body-limit 413、timeout 504//api/ai 豁免、安全头。

## 二、Biome 迁移（chore: migrate linting and formatting to biome）

- **坑：`bun add -d biome` 装到的是假包！** npm 上的裸 `biome` 是个废弃的 dotenv-like 包（version 0.3.3，`bin: biome`）。真身是 **`@biomejs/biome`**（2.5.8）。装错后 `bunx biome --version` 输出 0.3.3 暴露了问题，`bun remove biome && bun add -d @biomejs/biome` 纠正。
- 根 `biome.json`：`files.includes` 只覆盖 `services/api/**` + `apps/web/**`（**services/mcp 冻结零改动**、apps/cli Go 天然忽略、apps/mobile 不在范围），`!services/api/drizzle`（生成物不格式化）；formatter = 旧 Prettier 参数（lineWidth 100 / 无分号 / 单引号 / 尾逗号 all / 箭头恒括号）；linter 用 `preset: "recommended"`（**2.x 已弃用 `recommended: true`，`biome migrate --write` 自动修**）；css parser 开 `tailwindDirectives: true`（globals.css 的 @source/@custom-variant/@theme/@apply 否则解析失败）。
- 收敛的规则：**a11y 整体 off**（旧 eslint 从无 a11y 规则，修 20+ 个既有组件属无关 UI 改动，留给后续专项）；**noNonNullAssertion off**（旧 lint 未启用，`?.` 改写会削弱测试断言）；**noArrayIndexKey off**（AI 消息流为追加式、RenderMessage 无 id，索引即稳定键；location-picker 的 key 已实修成 name+坐标）。
- lint 逼出的真修复：ai.handler WS 消息从 `any` 收紧为穷尽联合类型（prompt/steer/followUp/abort/list_sessions/new_session/switch_session/delete_session）；storage.ts walk 的 `let entries: Dirent[]`；location.domain GCJ-02 EE 常量写成 double 可表示值（0.006693421622965943，行为不变消精度告警）；sidebar 移除多余 setState 依赖；message-list/moment-create 的滚动/自适应高度 effect 用 **biome-ignore 标注意图性依赖**（unsafe fix 会删掉它们导致行为回归——`--write --unsafe` 时务必复查 diff）；test fixture 的 `as any` → `as unknown as AgentMessage[]` / `Parameters<typeof tool.execute>[4]`。
- 格式化范围核验：git status 只有 apps/web + services/api + 根配置文件；mcp/cli/mobile 0 改动。`biome check .` exit 0。

## 三、部署 + 线上冒烟发现的问题

- 本地 `docker build -t serenique-api`（**带代理 build-args**：`--build-arg http_proxy=http://host.docker.internal:7897` 等，见 docker-local-build.md）→ 成功（hono-rate-limiter 编译通过）。本地 arm64 镜像**未推送**。
- Web：`VITE_API_BASE_URL=https://api.hcyj.xyz/serenique bun run build` ✓ → `bunx wrangler pages deploy dist --project-name=serenique-web --branch main` ✓（**必须带 --branch main**）→ pages.dev 与自定义域名 200。
- 后端：push main → CI docker-publish 出 `zeroicey/serenique-api:main`。hpcore 部署**踩了镜像加速器缓存坑**：第一轮 `docker pull :main` 拿到的 digest 与 CI 不一致（e4512ddf… 旧值），按 hpcore-deploy.md 用 **digest 精确拉取**（`docker pull ...@sha256:44b147a4…`）+ tag + `--force-recreate api` → 容器 digest 与 CI 完全一致、healthy。
- **线上冒烟发现的 bug**（第一版部署后）：evil Origin + multipart 请求应 403 却返回 **500 INTERNAL**——hono/csrf 抛 HTTPException(403)，而 app.ts 全局 onError 把一切异常转 500。修复：csrf 中间件内 catch 403 转 `Res.forbidden()` 统一信封（`fix(api): return 403 FORBIDDEN envelope…`），补了信封断言单测，重新推送 CI → digest 拉取 → 再部署。
- 最终线上验证（全部通过）：
  - `GET /health` → `{"success":true,...,"data":{"status":"ok"}}`
  - evil Origin + multipart → **403 `{"code":"FORBIDDEN"}`**
  - 无 Origin POST（CLI 行为）→ **401 UNAUTHORIZED**（不被 CSRF 拦）
  - 白名单 Origin POST → 401（过 CSRF 到认证）
  - 安全头：CORP cross-origin / HSTS / nosniff / X-Frame-Options 均在
  - web 双域名 200

## 对下一次会话的提示

1. **裸 `biome` 是假包**（dotenv-like），必须 `@biomejs/biome`。biome 2.x 配置用 `preset: "recommended"` 而非 `recommended: true`；JSON 里 `files.includes` 用 `!` 前缀做 exclude（`ignore` 字段已弃用）。
2. **biome-ignore 位置必须紧贴诊断行上一行**；JSX 里属性间不能放 `{/* */}`（解析失败）。拿不准就禁用规则并在 worklog 说明，别跟 formatter 的换行较劲。
3. **`--write --unsafe` 会删「多余」的 effect 依赖**——`[messages, activeTurn?.text]` 这类意图性依赖会被删掉导致滚动/自适应高度回归，必须复查。
4. hono/csrf 抛的 HTTPException 会被 app.ts 全局 onError 吞成 500——**所有新中间件的失败响应都要在中间件层构造统一信封**，不能依赖异常路径。
5. hpcore 镜像加速器对 `:main` tag 的缓存是**每次都可能发生**的（不是一次性的）：pull 后必须 `docker inspect ... --format '{{.RepoDigests}}'` 与 `gh run view <run> --log | grep containerimage.digest` 比对，不一致就 digest 精确拉取。
6. compose.yml 引用 `:latest`，而 main push 只出 `:main`——常规更新流程 = 拉 `:main` 验 digest → tag 成 `:latest` → `up -d --force-recreate api`。

## 状态

- 提交（English conventional）：`8137fb9 feat(api): add security middleware…` → `423f621 chore: migrate linting and formatting to biome` → `fda15ba fix(api): return 403 FORBIDDEN envelope…`，均已推 main。
- 验证：api `bun test` 213 pass / 0 fail；web vitest 239 pass；根 `bun run typecheck` 全绿；`biome check .` exit 0。
