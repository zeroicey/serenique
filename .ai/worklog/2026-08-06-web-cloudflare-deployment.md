# 2026-08-06 — Web 前端上线 Cloudflare Pages

将 `apps/web`（React 19 + Vite，SPA）部署到 Cloudflare Pages，走通「本地构建 → wrangler 直传 → pages.dev 域名」整套流程。生产地址：**https://serenique-web.pages.dev**。

## 关键事实（本次确认）

- **后端请求地址不是写死的**：`apps/web/src/config/env.ts` 读 `VITE_API_BASE_URL`（构建期），为空时回退相对路径 `/api/*`（dev 由 Vite proxy 转发）。生产注入 `VITE_API_BASE_URL=https://api.zeroicey.me`（v0.2.0 公网部署的 API 域名）。产物已确认包含该 URL。
- **CORS 无碍**：API 生产默认 `Access-Control-Allow-Origin: *`（未设 `CORS_ORIGIN`），跨域直调 `api.zeroicey.me` 已验证通过。
- **SPA 路由兜底**：react-router 用 `createBrowserRouter`，直接刷新子路径会 404。新增 `apps/web/public/_redirects`（`/* /index.html 200`），Vite 构建时复制进 dist。`/moment` 线上返回 200 text/html 已验证。

## 部署流程（wrangler 直传）

```sh
# 1. 授权（首次，OAuth 浏览器授权；本机无 API token 前置）
bunx wrangler login

# 2. 构建（注入公网 API 地址；dist 被 git 忽略，必须现场构建）
cd apps/web && VITE_API_BASE_URL=https://api.zeroicey.me bun run build

# 3. 建项目（仅首次；wrangler 4.x 不再自动建 Pages 项目，会报 "project does not exist"）
bunx wrangler pages project create serenique-web --production-branch=main

# 4. 部署
bunx wrangler pages deploy dist --project-name=serenique-web
```

账号：`zeroicey.hp@gmail.com`；Account ID `c41da26c0129fed3ea33ec684993ce0a`。项目 `serenique-web`，production branch `main`，自动域名 `serenique-web.pages.dev`。

## 验证结果

- `https://serenique-web.pages.dev/` → 200，正确的 Serenique index.html（zh-CN）。
- `https://serenique-web.pages.dev/moment` → 200 text/html（SPA 兜底生效）。
- 线上 bundle 含 `https://api.zeroicey.me`（懒加载 chunk `unwrap-*.js`，不在主 bundle，别在 index 里 grep）。
- 部署时报 `Uploading _redirects`，规则已生效。

## 对下一次会话的提示（pitfalls）

- **中国网络 → Cloudflare 间歇 522**：curl pages.dev 偶发 `HTTP 522`（连接超时，约 1/3 请求），重试即好。与 Azure 公网 IP 直连不稳是同类线路问题，非部署缺陷。
- **bunx wrangler 很慢**：Cloudflare API 调用常 30s–120s+，`wrangler pages project create` 曾超 120s。Bash 里跑命令给足超时（≥300s）或容忍转后台。
- **wrangler 4.x 必须先建项目**：`wrangler pages deploy` 对不存在的项目报错并建议改用 Workers；先 `pages project create` 再 deploy。
- **重复部署 = 构建 + deploy 两步**：dist 每次重建（含 `_redirects`），改代码后重跑 `VITE_API_BASE_URL=... bun run build && bunx wrangler pages deploy dist --project-name=serenique-web`。
- **自定义域名（后续可选）**：当前用自动 pages.dev。旧项目 `serenique.0icey.icu`（Cloudflare Pages 上的废弃旧前端）仍占用该域名且持续 502，若想复用需先在面板下线旧 Pages 项目再绑。绑定命令 `wrangler pages deployment list` / 面板 `Custom domains`。
- **源码改动待提交**：`apps/web/public/_redirects` 是新增文件，未提交。以后若有人改了它，重建 dist 时会带上。
- 也可考虑把「构建+部署」写进 CI（.github/workflows），用 `CLOUDFLARE_API_TOKEN`（secret）替代本地 OAuth，实现 push 自动部署。本次未做，先走通手动流程。

> 标准流程已抽到 `.ai/runbooks/web-cloudflare-deploy.md`，本文件保留事件记录。
