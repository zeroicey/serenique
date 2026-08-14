# 2026-08-14 — 修复 Web moment 列表滚动加载失效（sentinel 被 flex 压成 0×0）

用户反馈：moment 列表页向下滚动时不会加载下一页。本地 dev 正常、生产必现，查了整条链路（API 分页、TanStack Query 分页逻辑、部署 bundle 一致性）都没问题，最终定位到 CSS 层。

## 改动

- **apps/web** `features/moment/components/moment-list.tsx`：滚动哨兵 `<div ref={sentinelRef} className="h-1" />` → `className="h-4 w-4 shrink-0"`

## 根因（坑）

哨兵 div 位于 `flex w-full flex-col items-center` 列内，该列被 `h-full` 链（`main` flex-1 overflow-auto → `h-full` wrapper）撑成**定高**。内容（10 条/页）溢出定高 flex 列时，flex-shrink 会把**空的**哨兵元素压到 0×0（空元素 `min-height:auto` 的 min-content 高度就是 0，是整列唯一能被压缩的项）。IntersectionObserver 规格上零面积元素**永远** `isIntersecting: false`（即使 rootMargin 覆盖），于是 `fetchNextPage` 永不触发。

为什么本地测不出来：本地窗口更高（922px vs 生产 737px），哨兵恰好落在滚动容器底边内；生产视口矮 + `py-4` padding 让哨兵落在 `<main>` 滚动口底缘下方 0.1px，被裁剪 → 永不相交。

## 验证

- `bun run test -- --run src/features/moment`：9 files / 46 tests pass
- `bun run typecheck`：clean
- 本地浏览器（ego-browser 注入会话 cookie）：滚动后 10→20→…→108 全部加载
- 生产 `serenique.0icey.icu`（DOM 打补丁模拟修复类）：12（卡住）→ 24→34→52→88 逐页加载，确认根因
- 生产 DB 清理：`delete from api_tokens where name='debug-pagination-test'`（调试用临时 token）

## 对下一次会话的提示

- 测试本地 web：`:5173` 是 koma 的 vite，不是 serenique 的。serenique web 需 `cd apps/web && VITE_API_BASE_URL=http://localhost:3100 bun run dev --port 5174`（API 用 `CORS_ORIGIN=http://localhost:5174` + 会话 cookie 注入）。
- ego-browser 跨域调试生产 API：会话 cookie 要设给 **API 域名**（`api.hcyj.xyz`），不是 web 域名；`Network.setCookie` 需 `sameSite:'None'`。或用临时 token：DB 插入 `api_tokens`（SHA-256 hex），请求带 `Authorization: Bearer`（`auth/me` 认 token 身份）。
- 本地 API 端口 3000 被无关进程占用时，改用 `PORT=3100`（web 端用 `VITE_API_BASE_URL` 直连绕过 vite proxy）。
- 部署后如需真机验证：`apps/web` 重新构建部署（Pages），用户刷新即可。本轮只改了 web，API 无需动。
