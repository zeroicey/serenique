# 2026-08-08 — Flutter 移动端「日志」页（服务端审计日志）

把 `apps/mobile` 侧边栏「日志」占位页替换为真实审计日志页：列表（时间/级别/事件/消息/来源/IP/已读）
+ 级别与未读筛选 + 全部置已读 + 未读计数。服务端 audit 模块尚未上线，按需求 §6 契约实现并用 mock 测试，
后端上线即可用。改动仅限 `apps/mobile`。

## 背景

服务端 audit 模块由 API agent 实现中，接口契约已定但未部署：`GET /api/audit/logs`（分页 + level/event/
unreadOnly 过滤，`created_at DESC`，返回 `{ items, total }`）、`GET /api/audit/logs/unread-count`
（`{ unreadCount }`）、`PUT /api/audit/logs/read`（body `{ ids }`，空 = 全部置已读）。移动端按此契约
实现读侧，用 mock 测试，后端 404 时页面优雅降级。

## 改动（apps/mobile）

### 1. `lib/features/audit/`（新增）

| 文件 | 内容 |
|------|------|
| `audit_models.dart` | `AuditLevel` 枚举（info/warn/error + 中文 label + `fromWire` 兜底 info）；`AuditLogEntry` 镜像 `LogEntry`（id/event/message/level/source/ip/detail/isRead/createdAt，手写 `fromJson`，source/ip/detail 可空、detail 非 map 兜底 null）；`AuditLogPage`（items+total） |
| `audit_api.dart` | `AuditApi.list()`（page/pageSize/level/event/unreadOnly，**unreadOnly 仅传 true**，false 时省略该参数——避开后端 `z.coerce.boolean` 把 "false" 解析成 true 的坑）；`unreadCount()`；`markRead({ids})`（空/null → body `{}` 全部置已读） |
| `audit_providers.dart` | `auditApiProvider`；`AuditFilter` + `AuditFilterNotifier`（NotifierProvider，级别/只看未读）；`auditListProvider`（FutureProvider，watch 筛选自动重拉）；`auditUnreadCountProvider`；`AuditActions.markAllRead()`（成功 invalidate 列表 + 未读数） |

### 2. `lib/features/audit/audit_page.dart`（新增）

- 顶部工具条：未读计数胶囊（未读 0 显示「没有未读日志」）+ 「全部已读」按钮（未读 0 时禁用，成功后 SnackBar 提示已标记 N 条）。
- 筛选条：级别 ChoiceChip（全部/信息/警告/错误）+ 只看未读 FilterChip。
- 列表：每条 = 级别彩色图标 + 消息（未读加粗）+ `时间 · 级别 · 事件` + `来源 xx · IP xx` + 未读红点。
  时间用 `intl` 转本地 `yyyy-MM-dd HH:mm`。
- 空态：普通「暂无日志」/ 只看未读时「没有未读日志」；错误态复用 `AsyncErrorView`，**404 特判**给
  「后端尚未上线日志接口」友好文案（后端未部署时优雅降级），其余透传后端中文 message。
- 下拉刷新 invalidate 列表 + 未读数。

### 3. `lib/shared/widgets/async_view.dart`

`AsyncErrorView` 增加可选 `message` 参数，覆盖默认 `humanizeError(error)` 文案（向后兼容，未破坏现有调用）。

### 4. `lib/router.dart`

`/audit` 从 `PlaceholderPage(title: '日志')` 换成 `AuditPage()`。

## 验证

- `flutter analyze` → **No issues found**。
- `flutter test` → **89/89 PASS**（基线 65 + 新增 24）：
  - `audit_models_test` 8：字段解析、可选缺省、level 兜底、detail 非 map、分页。
  - `audit_api_test` 6：query 透传、`unreadOnly=false` 省略参数、unreadCount 解析、markRead 带 ids / 空 ids → `{}`。
  - `audit_page_test` 9：渲染、已读/未读、空态、404 降级文案、普通错误透传、按钮禁用、全部已读调用 + SnackBar、
    级别筛选、只看未读筛选。
  - `router_test` +1：`/audit` 渲染真实 `AuditPage`（非占位）。

## 对下一次会话的提示

- **后端 audit 接口未上线**：联调时以 `services/api/src/modules/audit/` 源码为准同步字段（`isRead`/`createdAt`/
  `level` 枚举等）。若后端把 `createdAt` 返回成非 ISO 或字段有出入，改 `AuditLogEntry.fromJson` 即可。
- **`unreadOnly` 传参**：移动端只在筛选开启时发 `unreadOnly=true`，关闭时省略参数——后端 `z.coerce.boolean`
  会把 `"false"` coerce 成 `true`，别「顺手」传 `false`。
- **`markRead({})` 是全局置已读**：空 body / 空数组都会把全部日志标记已读。页面上「全部已读」按钮只对
  未读数 > 0 开放，且不弹确认（非破坏性状态翻转，对齐 CLI 侧口径）。
- **列表只拉第一页（pageSize=50，后端最大 50）**：v1 未做分页加载更多/无限滚动。若日志量大需要「加载更多」，
  在 `AuditPage` 加滚动加载并让 `auditListProvider` 支持翻页。
- **侧边栏「日志」角标本轮未做**：需求允许后续加未读角标，届时把 `auditUnreadCountProvider` 接进
  `app_shell.dart` 的 `badgeFor` 即可（现 `countsProvider` 只拉闪记/日记）。
- Riverpod 3.4.2 注意：`AsyncValue.valueOrNull` **不存在**，用 `.value`；`Override` 类型不在公开导出面，
  测试里别显式标注 `List<Override>`，直接内联 `ProviderScope(overrides: [...])`。
