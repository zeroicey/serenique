# 2026-08-08 — Web：服务端审计日志模块 + 侧边栏对齐移动端

本轮为 Web 前端（`apps/web`）改动。服务端 `audit` 模块由 API Agent 实现中（契约已定、接口未上线），
Web 按契约写前端、用 mock 测，接口 404 时优雅降级。未动 `apps/mobile`（并行 Flutter Agent 有独立改动）。

## 1. 日志模块（features/audit）

按 `.ai/requirements/2026-08-08-audit-module.md` §3 / §6 契约实现，路由 `/audit`：

| 文件 | 职责 |
|------|------|
| `features/audit/api.ts` | 契约类型 + Ky 请求：`listAuditLogs`（page/pageSize/level/event/unreadOnly）、`getAuditUnreadCount`、`markAuditRead`（body `{ids}`，缺省/空 = 全部已读） |
| `features/audit/queries.ts` | `useAuditLogs`（分页 + `keepPreviousData`）、`useAuditUnreadCount`（30s 轮询，供侧边栏角标）、`useMarkAuditRead`（成功 invalidate 整个 `['audit']` 域） |
| `features/audit/components/audit-log-list.tsx` | 居中卡片列表：时间/级别角标/事件 key/消息/来源·IP/已读；未读卡片左侧高亮竖条 |
| `features/audit/components/audit-level-badge.tsx` | info=信息 / warn=警告 / error=错误 |
| `features/audit/components/audit-nav.tsx` | 顶栏 handle.nav：标题「日志」+「全部置已读」按钮（无未读时禁用） |
| `features/audit/pages/audit-page.tsx` | 级别筛选 chips + 「仅看未读」checkbox + 分页 + 刷新；加载/空/错误态 |
| `features/audit/index.ts` | barrel |

**未上线降级**：`isNotImplemented()` 识别 ApiError 404 与 ky HTTPError 404（后端未部署时 Hono/反代返回原始 404）→
显示「日志功能尚未上线」+ 重试；其他错误显示「加载日志失败」+ 重试。侧边栏/导航的未读数查询失败时角标不显示、置已读按钮禁用。

**不做删除**：接口与 UI 均无删除（需求 §6 明确）。

## 2. 侧边栏同步到与移动端一致

移动端 `app_shell.dart` 结构：宁序(ai) → 闪记(moments) → 日记(diary) → 习惯(habit) → 任务(task) → 日历(event) → 素材库(files) → 日志(audit) → [设置]。

| | 旧（Web） | 新（Web，对齐移动端） |
|---|---|---|
| 顺序 | 闪念 → 日记 → 日程 → 任务 | 宁序 → 闪记 → 日记 → 习惯 → 任务 → 日历 → 素材库 → 日志 → 设置 |
| 标签 | 闪念 / 日程 | 闪记 / 日历（全站统一，`sed` 重命名用户可见文案） |
| 新增模块 | — | 宁序 `/ai`、习惯 `/habit`、素材库 `/files`、设置 `/settings`（占位「开发中」页） |
| 日志 | — | `/audit` 真实日志页 |

- `app-sidebar.tsx` 改为配置数组 `NAV_ITEMS` 驱动，`badgeFor` 对齐移动端：闪记/日记真实总数、任务/日历/习惯写死占位（3/2/5）、日志未读数（0 不显示）。
- 计数 hook `app/layout/use-sidebar-counts.ts`：闪记/日记各拉 `pageSize=1` 读 total（对齐移动端 `count()`），60s 轮询；日志未读走 `useAuditUnreadCount` 30s 轮询。
- 占位页：`components/common/placeholder-page.tsx`（🚧 开发中）+ `app/pages/placeholder-module-page.tsx`（按路径推标题）+ `app/pages/module-title-nav.tsx`（顶栏标题）。
- `router.tsx` 注册 `/audit` 与 4 个占位路由，全部懒加载；`welcome-page.tsx` 模块入口卡片同步。
- 已确认保留：评论头像+文字环绕（`moment-comment-list.tsx`）、品牌 logo（`/logo_header.svg`）、顶栏标题随路由（各路由 handle.nav）。

**SidebarMenuBadge 定位坑**：badge 必须作为 `SidebarMenuButton` 的兄弟（peer）节点才能吃到 `top-1.5` 垂直定位。
最初放在 NavLink 外侧，badge 落到底部溢出；改放进 NavLink render-prop 的 fragment 内、紧挨按钮后正常。

## 3. 测试（mock 数据，不真请求后端）

新增/更新 8 个测试文件，mock audit api/hooks：
- `features/audit/api.test.ts`：searchParams 透传、unread-count、markRead 空 body / 带 ids。
- `features/audit/queries.test.tsx`：useAuditLogs / useAuditUnreadCount / useMarkAuditRead（含 toast 文案）。
- `features/audit/components/audit-log-list.test.tsx`：空态、级别/事件/来源/IP/已读渲染。
- `features/audit/pages/audit-page.test.tsx`：加载、筛选、分页、404 优雅降级、错误重试（注意级别筛选用 `getByRole('button')` 避免与卡片角标文本撞车）。
- `components/common/placeholder-page.test.tsx`、`components/common/app-sidebar.test.tsx`（对齐移动端全项 + badge 值）。

## 4. 验证

- `bun run typecheck` ✅
- `bun run test`：41 files / 151 tests 全绿 ✅
- `bun run build` ✅（audit-page 独立懒加载 chunk）

## 对下一次会话的提示
- 后端 audit 接口上线后无需改前端；`isNotImplemented` 只识别 404，接口 200 后自然走正常列表。
- 全站文案已从「闪念/日程」统一为「闪记/日历」，后续新增 UI 直接用新叫法。
- 任务/日历/习惯的侧边栏 badge 是写死占位（3/2/5），等对应模块接真实计数后再替换。
