# Web 前端部署（Cloudflare Pages）

**适用范围**：`apps/web` → `serenique-web.pages.dev`（自定义域名 `serenique.0icey.icu` 指向同一部署）。生产注入 `VITE_API_BASE_URL=https://api.hcyj.xyz/serenique`（国内加速入口，见 `cn-access-hcyj.md`）。

## 流程

```sh
# 1. 构建（dist 被 git 忽略，必须现场构建）
cd apps/web && VITE_API_BASE_URL=https://api.hcyj.xyz/serenique bun run build

# 2. 部署
bunx wrangler pages deploy dist --project-name=serenique-web
```

## 反代适配（切换入口前必读）- **签名链接**：`POST /api/blobs/:id/access-link` 返回的 `url` 字段是后端按自己看到的 origin 拼的绝对 URL（缺 `/serenique` 前缀），**不能用**；Web 用返回的**相对 `path`** 拼 baseUrl：`resolveApiPath(link.path)`（`apps/web/src/features/blob/access.ts`）。直链同理走 `resolveApiPath`。无前缀入口（api.zeroicey.me）同样正确。
- **CORS**：浏览器 Origin 是 `https://serenique.0icey.icu`，反代原样透传，**服务端 `CORS_ORIGIN` 不用改**（已核验：hpcore 生产值即 `https://serenique.0icey.icu`，预检返回 `access-control-allow-origin` 匹配 + credentials:true）。
- **会话 Cookie**：生产 `SameSite=None; Secure`，跨站（pages → api.hcyj.xyz）可用，服务端无感。
- **Caddy 侧**（hcyj）：`handle_path /serenique/*` 剥离前缀 + `keepalive off`，见 `cn-access-hcyj.md`，已配置好，勿动。
- 部署后核验线上 chunk 含新地址：旧 bundle 的 API base 在**懒加载 chunk**（如 `unwrap-*.js`）里，别在主 index bundle grep。

## AASA / assetlinks（passkey 域名关联）

- **必须用 Pages Functions，不能放静态文件**：`_redirects` 的 SPA 兜底（`/* /index.html 200`）无条件优先于静态资产（官方文档：redirects always followed regardless of asset match），且 redirects 先于 `_headers` 执行——静态 `.well-known/` 文件会被 rewrite 成 index.html。
- 实现：`apps/web/functions/.well-known/apple-app-site-association.ts`（`onRequestGet` 返回 JSON + `Content-Type: application/json`）。Functions 优先于 `_redirects`，不受 SPA 兜底影响。
- 验证：`curl -s https://serenique.0icey.icu/.well-known/apple-app-site-association` 应返回 `{"webcredentials":...}`（content-type application/json）。
- 将来 Android assetlinks.json 同套路（`functions/.well-known/assetlinks.json.ts`）。

## 坑

- **feature 分支部署 ≠ 生产**：wrangler pages deploy 默认部署到**当前 git 分支**的 preview 环境（别名 `feat-xxx.serenique-web.pages.dev`）。要更新生产（serenique.0icey.icu / serenique-web.pages.dev）必须显式 `--branch main`。部署后核验域名，别只看别名 URL。
- **bunx wrangler 很慢**（30s–120s+）：Bash 里给足超时（≥300s）。
- **wrangler 4.x 必须先建项目**：`wrangler pages project create serenique-web --production-branch=main`（仅首次）。
- **SPA 路由兜底**：`apps/web/public/_redirects`（`/* /index.html 200`）会被复制进 dist，直接刷新子路径靠它回退。
- **中国网络 → Cloudflare 间歇 522**：重试即好，非部署缺陷。
- 账号：`zeroicey.hp@gmail.com`；Account ID `c41da26c0129fed3ea33ec684993ce0a`。
- 自定义域名 `serenique.0icey.icu` 现已被本 Pages 项目接管（2026-08-08 实测 200，旧 502 项目已不在）。
- 验证：`curl -I https://serenique-web.pages.dev/moment` 应 200 text/html；线上 bundle 含 api.hcyj.xyz（懒加载 chunk）。

## 坑：自定义域名间歇 404 chunk（2026-08-13 实测修复）

- **症状**：自定义域名 `serenique.0icey.icu` 上静态资源（chunk/logo）**间歇 ~50% 返回 404**，pages.dev 子域名完全正常。用户浏览器表现为「一堆 404，找不到编译后的文件」。
- **根因**：项目有 catch-all `functions/[[path]].ts`（SPA 兜底）。自定义域名路由下，静态资源请求**间歇**进入 Function，其 `ASSETS.fetch()` 返回 SPA fallback（200+text/html）而非真实文件（自定义域名路由竞态，pages.dev 无此问题）；Function 按旧设计把 text/html 响应转成真 404（`fd949ba` 防 MIME 缓存中毒的逻辑）→ 已有文件被间歇判 404。
- **修复（已部署）**：`apps/web/public/_routes.json` 加 `exclude: ["/assets/*", "/logo.png", "/logo_header.svg", "/sw.js", "/workbox-*.js", "/manifest.json", "/favicon.ico", "/pwa-*.png", "/maskable-icon-*.png", "/apple-touch-icon-*.png"]`——assets 请求**完全不进 Function，直连静态存储**；`[[path]].ts` 简化为只处理无扩展名 SPA 路由 + 防御性透传；`_redirects` 首行 `/assets/* /assets/:splat 200` 保证 assets 不被 SPA 兜底吞掉。
- **PWA 相关（2026-08-13 新增）**：PWA 文件（sw.js/manifest/图标）都必须加进 `_routes.json` exclude，否则自定义域名下会被 SPA fallback 吞（返回 200+text/html）。`_headers` 里 sw.js 必须用 `Cache-Control: no-store` 而非 `no-cache`——zone `browser_cache_ttl=14400` 会覆盖 no-cache（.js 在默认缓存扩展名列表），no-store 则被尊重（cf-cache-status: BYPASS）。manifest.json 用 no-cache 即可（.json 不在默认缓存列表）。部署后验证：`curl -sI https://serenique.0icey.icu/sw.js` 应返回 `no-store` + `BYPASS`。
- **注意**：`_redirects` 不支持 404 状态码 rewrite（文档明确 ❌），缺失 chunk 仍会走 SPA 兜底（200+HTML+4h 缓存）——只在部署传播窗口期新 chunk 未同步时短暂出现，传播完成自愈，可接受。
- **验证**：`for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}" https://serenique.0icey.icu/assets/<chunk>.js; done` 应 15/15 全 200。
