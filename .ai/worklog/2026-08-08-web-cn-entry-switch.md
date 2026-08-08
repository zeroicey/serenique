# 2026-08-08 — Web 端后端地址切换至国内入口（api.hcyj.xyz/serenique）

Web 端（Cloudflare Pages）此前打的是境外入口 `https://api.zeroicey.me`（Azure，国内实测 5.9–50s 飘忽）；国内入口 `https://api.hcyj.xyz/serenique`（hcyj Caddy 反代 → EasyTier → hpcore，见 `cn-access-hcyj.md` 与决策 `2026-08-08-production-cn-entry.md`）早已就绪，本次把 Web 生产部署切过去。

## 改动（commit 待提交）

- **构建/部署**：`cd apps/web && VITE_API_BASE_URL=https://api.hcyj.xyz/serenique bun run build && bunx wrangler pages deploy dist --project-name=serenique-web`
- **代码零改动**：Web 客户端本就反代安全——`apiUrl`/`resolveApiPath` 用 base+相对路径（`apps/web/src/api/client.ts`），签名链接只用返回的 `path` 字段（`apps/web/src/features/blob/access.ts`），Caddy 剥离 `/serenique` 前缀无影响
- **runbook**：`.ai/runbooks/web-cloudflare-deploy.md` 生产 baseURL 更新 + 新增「反代适配」章节

## 验证

- 线上双域名（serenique-web.pages.dev + serenique.0icey.icu）新 bundle `index-BymP4VpB.js`，懒加载 chunk `unwrap-BmYtoFgv.js` 含 `api.hcyj.xyz/serenique`，旧 `api.zeroicey.me` 零残留
- CORS 预检（Origin: https://serenique.0icey.icu）→ 204 + `access-control-allow-origin` 匹配 + credentials:true（服务端 `CORS_ORIGIN` 未动，仍为 serenique.0icey.icu）
- 全链路冒烟（cookie jar + Origin 头模拟浏览器）：登录 200 + `SameSite=None; Secure` Cookie → 建 moment/传 blob → 签名链接 `path=/api/blobs/...`（无前缀）→ `base+path` 访问 200 全量文件 → 清理 204
- 延迟实测（本机 `--noproxy '*'`）：CN 入口 65–69ms 稳定 vs 境外 5.9s/9.1s/50.3s
- 注：`serenique.0icey.icu` 实测 200 已被本 Pages 项目接管（旧 runbook 的「502 旧项目占用」说法已过时）

## 坑 / 对下一次会话的提示

- **生产 API 仍是旧镜像**：hpcore 容器无 moment `location` 字段（旧 zod 静默丢弃未知字段，创建响应无 `location` 键），DB 迁移 0011 也未在 prod 应用。位置功能要上线需：push main 触发 docker-publish → hpcore pull 新镜像 + `db:migrate`（走 `hpcore-deploy.md` runbook），本次 Web 切换未包含
- 线上 bundle grep API base 要查**懒加载 chunk**（`unwrap-*.js`），主 index bundle 里没有
- 本机 curl 必须 `--noproxy '*'` 测真实延迟（默认走代理 7897 测的是代理）
