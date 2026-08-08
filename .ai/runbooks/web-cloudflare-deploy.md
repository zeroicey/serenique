# Web 前端部署（Cloudflare Pages）

**适用范围**：`apps/web` → `serenique-web.pages.dev`（自定义域名 `serenique.0icey.icu` 指向同一部署）。生产注入 `VITE_API_BASE_URL=https://api.hcyj.xyz/serenique`（国内加速入口，见 `cn-access-hcyj.md`）。

## 流程

```sh
# 1. 构建（dist 被 git 忽略，必须现场构建）
cd apps/web && VITE_API_BASE_URL=https://api.hcyj.xyz/serenique bun run build

# 2. 部署
bunx wrangler pages deploy dist --project-name=serenique-web
```

## 反代适配（切换入口前必读）

- **签名链接**：`POST /api/blobs/:id/access-link` 返回的 `url` 字段是后端按自己看到的 origin 拼的绝对 URL（缺 `/serenique` 前缀），**不能用**；Web 用返回的**相对 `path`** 拼 baseUrl：`resolveApiPath(link.path)`（`apps/web/src/features/blob/access.ts`）。直链同理走 `resolveApiPath`。无前缀入口（api.zeroicey.me）同样正确。
- **CORS**：浏览器 Origin 是 `https://serenique.0icey.icu`，反代原样透传，**服务端 `CORS_ORIGIN` 不用改**（已核验：hpcore 生产值即 `https://serenique.0icey.icu`，预检返回 `access-control-allow-origin` 匹配 + credentials:true）。
- **会话 Cookie**：生产 `SameSite=None; Secure`，跨站（pages → api.hcyj.xyz）可用，服务端无感。
- **Caddy 侧**（hcyj）：`handle_path /serenique/*` 剥离前缀 + `keepalive off`，见 `cn-access-hcyj.md`，已配置好，勿动。
- 部署后核验线上 chunk 含新地址：旧 bundle 的 API base 在**懒加载 chunk**（如 `unwrap-*.js`）里，别在主 index bundle grep。

## 坑

- **bunx wrangler 很慢**（30s–120s+）：Bash 里给足超时（≥300s）。
- **wrangler 4.x 必须先建项目**：`wrangler pages project create serenique-web --production-branch=main`（仅首次）。
- **SPA 路由兜底**：`apps/web/public/_redirects`（`/* /index.html 200`）会被复制进 dist，直接刷新子路径靠它回退。
- **中国网络 → Cloudflare 间歇 522**：重试即好，非部署缺陷。
- 账号：`zeroicey.hp@gmail.com`；Account ID `c41da26c0129fed3ea33ec684993ce0a`。
- 自定义域名 `serenique.0icey.icu` 现已被本 Pages 项目接管（2026-08-08 实测 200，旧 502 项目已不在）。
- 验证：`curl -I https://serenique-web.pages.dev/moment` 应 200 text/html；线上 bundle 含 api.hcyj.xyz（懒加载 chunk）。
