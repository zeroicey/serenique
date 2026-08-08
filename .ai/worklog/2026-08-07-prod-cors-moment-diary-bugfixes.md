# 2026-08-07 — 生产 CORS 切换 + Moment/日记系列 bugfix（上线体验反馈）

用户正式上线后反馈 4 个问题：Moment 排序倒置、移动端「设置→登出」后卡死、Web 当天无日记触发 TanStack Query 重试风暴、移动端新增日记打不开。均由队长拆解、三端 agent 并行修复并验证（API / Web / Flutter 各写独立 worklog）。

## 1. 生产 CORS 切换（已上线，即时生效）

- **现象**：新生产前端 `https://serenique.0icey.icu`（原 `serenique-web.pages.dev`）跨域调 `api.zeroicey.me`，带 Cookie 的登录被浏览器拦截。
- **根因**：生产 `NODE_ENV=production` 会话 Cookie 是 `Secure`+`SameSite=None`；带凭证跨域不允许 origin `*`。hpcore 上 `/srv/compose/serenique/.env` 的 `CORS_ORIGIN` 还是旧 pages.dev。
- **改动**：hpcore `.env` 第 6 行改为 `CORS_ORIGIN=https://serenique.0icey.icu`（**用户确认前端走 HTTPS**；origin 不带结尾斜杠），改前备份 `.env.bak.cors.20260807121108`，`docker compose up -d --no-deps api` 重建（healthy）。
- **验证**：容器级 + hpazure 公网链路 `access-control-allow-origin: https://serenique.0icey.icu` + `allow-credentials: true`；旧 pages.dev origin 不再放行。
- **网络路径坑**：本机/relay 直连 hpcore（10.126.126.2）不通；`ssh -J hpazure hpcore` 跳板可用（hpazure 能反向够到 hpcore:22）。hpcore 自身 curl 公网 `api.zeroicey.me` 空响应 = NAT hairpin 问题，验证公网要从 hpazure 侧做。
- **本地文档**：`.env.example` 补了 `CORS_ORIGIN` 条目（docker-compose 早已接线 `${CORS_ORIGIN:-}` 但一直无示例）。

## 2. Moment 列表顺序倒置（代码已改，待发布）

- **根因**：`moment.service.ts` `list()` 用 `.orderBy(moments.createdAt)` **升序**，最早的排最前。
- **改动**：`.orderBy(desc(moments.createdAt))`（`desc` 从 drizzle-orm 引入）。Web/移动端不重排，后端一处改动全端生效。集成测试新增「newest-first」用例（固定不同 createdAt）。

## 3. 后端错误体补 `code`（代码已改，待发布）

- **根因**：CLAUDE.md 文档化响应为 `{ success, code, message, data?, error? }`，但 `Res.error()` 从不输出 `code` → 移动端 `e.code == 'NOT_FOUND'` 恒不成立（dio 映射成 `API_ERROR`+statusCode 404）。
- **改动**：`response.ts` 的 `ResBuilder` 加 `.code()`，错误快捷构造器带上默认 code；`handler.ts` `handleError` 各分支补 `ErrorCode`。404 现返回 `code:"NOT_FOUND"`。
- **残留**（本次未动，超范围）：`auth.handler.ts` 登录 429/401 仍用裸 `Res.error().status()` 无 code；移动端已用双匹配兜底。

## 4. Web 当天无日记 → 重试风暴（代码已改，待发布）

- **根因**：`apps/web/src/features/diary/api.ts` `getDiaryByDate` 把 `api.get(...)` 放在 `try` 外，ky 默认 `throwHttpErrors:true` 在 404 直接 reject → 死代码 `catch(404→null)` 永不触发 → queryFn 抛错 → TanStack Query 默认 retry 3 次。
- **改动**：对齐 auth `fetchAuthStatus` 的既有模式：`{ throwHttpErrors:false }` + `res.status===404 → null`。新增真实 ky 边界测试（stub fetch），TDD 红→绿。
- **同类隐患**：`listMomentComments`、`getEvent` 等详情 GET 也有同样 `throwHttpErrors` 潜在问题，未在本次范围，可后续统一。

## 5. 移动端「设置→登出」卡死 + 新增日记打不开（Flutter agent，详见其 worklog）

- 卡死根因：`/login` 是壳外顶层路由，`context.go('/login')` 替换栈、无返回按钮、无抽屉 → 已登录用户被困。
- 修复：新增壳内 `/settings` 路由（保留菜单+抽屉可随时返回）；`/login` 回归纯登录表单（已认证访问 `/login`→重定向 `/moments`）；设置页显示打码密钥+退出登录。
- 日记根因：`diaryByDateProvider` 只认 `e.code=='NOT_FOUND'`，后端错误体无 code → 当天无日记被判成错误 → 编辑页打不开。修复：双匹配 `e.code=='NOT_FOUND' || e.statusCode==404`（同 auth 401 双匹配模式）。

## 发布提醒

moment 顺序、错误体 code、Web 404 修复均为**本地代码改动，未部署**；生产 api 容器跑 Docker Hub `latest`。需走发布流程（推 main → 打 tag）才生效；CORS 的 `.env` 改动已即时生效，无需等发布。

## 对下一次会话的提示

- 访问生产 hpcore：本机/relay 直连不通，用 `ssh -J hpazure hpcore`。
- 验证公网 CORS/HTTP 从 hpazure 侧 curl（hpcore 自身有 NAT hairpin 空响应）。
- 后端错误体现在带 `code`，移动端双匹配可逐步简化为只看 `code`，但 `auth` 429/401 仍无 code，别急着删双匹配。
- 改生产 `.env` 前先 `cp .env .env.bak.*`，改后 `docker compose up -d --no-deps api` 重建容器。

> 标准流程已抽到 `.ai/runbooks/hpcore-deploy.md`，本文件保留事件记录。
