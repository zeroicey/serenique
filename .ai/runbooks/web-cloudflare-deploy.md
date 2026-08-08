# Web 前端部署（Cloudflare Pages）

**适用范围**：`apps/web` → `serenique-web.pages.dev`。生产注入 `VITE_API_BASE_URL=https://api.zeroicey.me`。

## 流程

```sh
# 1. 构建（dist 被 git 忽略，必须现场构建）
cd apps/web && VITE_API_BASE_URL=https://api.zeroicey.me bun run build

# 2. 部署
bunx wrangler pages deploy dist --project-name=serenique-web
```

## 坑

- **bunx wrangler 很慢**（30s–120s+）：Bash 里给足超时（≥300s）。
- **wrangler 4.x 必须先建项目**：`wrangler pages project create serenique-web --production-branch=main`（仅首次）。
- **SPA 路由兜底**：`apps/web/public/_redirects`（`/* /index.html 200`）会被复制进 dist，直接刷新子路径靠它回退。
- **中国网络 → Cloudflare 间歇 522**：重试即好，非部署缺陷。
- 账号：`zeroicey.hp@gmail.com`；Account ID `c41da26c0129fed3ea33ec684993ce0a`。
- 自定义域名 `serenique.0icey.icu` 被旧 Pages 项目占用（持续 502），复用需先在面板下线旧项目。
- 验证：`curl -I https://serenique-web.pages.dev/moment` 应 200 text/html；线上 bundle 含 api.zeroicey.me（懒加载 chunk，别在主 bundle grep）。
