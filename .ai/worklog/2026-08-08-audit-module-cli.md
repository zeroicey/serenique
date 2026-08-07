# 2026-08-08 — CLI：`serenique logs` 审计日志命令

## 背景

服务端 audit 模块需求（`.ai/requirements/2026-08-08-audit-module.md`）把 CLI 列为后续阶段：`serenique logs`
命令（列表 / 未读 / 全部已读）。本次按契约实现 CLI 读侧三子命令，对齐现有 task / event 命令模式与 CLI 硬契约。

## 改动（`apps/cli`）

### 1. `internal/client/audit.go`（新增）

类型化方法，契约以需求 §6 为准：

- `AuditLogEntry` 镜像 `LogEntry`：`{ id, event, message, level, source, ip, detail, isRead, createdAt }`；
  `source` / `ip` 用 `*string`（可空）、`detail` 用 `map[string]any`（jsonb 可空）。
- `ListAuditLogs(ctx, query)`：走泛型 `List[T]` 解 `{ items, total }`，`level` / `event` / `unreadOnly`
  由调用方写进 query。
- `AuditUnreadCount(ctx)`：`GET /api/audit/logs/unread-count` → `{ unreadCount }`。
- `MarkAuditLogsRead(ctx, ids)`：`PUT /api/audit/logs/read`，`ids` 为空时 body 不携带 `ids` 键
  （服务端把缺省 / 空数组视为全部置已读）。
- `AuditLevelInfo/Warn/Error` 常量 + `IsAuditLevel()`（对齐 task 的 `TaskStatus*` 模式，供 cmd 层预校验）。

### 2. `cmd/audit.go`（新增）

父命令 `Use: "logs"`（Short：服务端审计日志），三子命令：

- `logs list`：走 `paginatedListCommand` 泛型分页工厂，`--level` / `--event` / `--unread-only` 过滤
  （`extraQuery` 注入）；`--level` 用 `PreRunE` 预校验（`validateAuditLevel`），打错字先本地报错不碰网络。
  表格列：时间 / 级别 / 事件 / 消息 / 来源 / IP / 已读。
- `logs unread`：显示未读数（JSON 模式 `{message, data:{unreadCount}}`；表格模式 key-value）。
- `logs read`：默认全部置已读，`--ids`（逗号分隔，自动去空白）精准标记；JSON 输出 `{updatedCount, unreadCount}`。

帮助里注明 `--level` 无简写：根命令 `-t` 被 token 占用、`-l` 已属于 `--page-size`（与既有命令一致）。

### 3. `cmd/root.go`

`rootCmd.AddCommand(auditCmd)` 注册 `logs`，与 config/blob/auth/event/init/diary/moment/task 无冲突。

### 4. 测试

- `internal/client/audit_test.go`：列表解包 + 查询参数透传、`detail:null` 解码为 nil map 不报错、
  unread-count 解码、mark-read 空 ids 省略 / 带 ids 发送、`IsAuditLevel` 边界。
- `cmd/audit_test.go`：list 过滤 query、list JSON `{items,total}`、list PreRun 级别校验、
  unread JSON 数据形状、read 默认不传 ids / 带 ids 去空白、helpers（级别/已读/时间标签）、
  命令树注册断言（`logs` 挂在 root 且含 list/unread/read）。

### 5. `README.md`

命令参考新增「服务端审计日志」小节。

## 时间显示口径

`auditTimeLabel` 把服务端 UTC ISO（带 `Z`）转**本地时区**并格式为 `2006-01-02 15:04:05`。审计日志对时间敏感
（登录尝试 / 删除时刻），直接 `prefix(createdAt,19)` 会显示 UTC 墙钟，+08:00 用户会误读 8 小时，故沿用
event 的「转本地 + 显式偏移」思路（列表列不加偏移以保持表格紧凑）。

## 验证

```
cd apps/cli
GOPROXY=https://goproxy.cn,direct go build ./...   # OK
GOPROXY=https://goproxy.cn,direct go vet ./...      # OK
GOPROXY=https://goproxy.cn,direct go test -count=1 ./...  # 4 包全过
```

## 对下一会话的提示

- **audit 模块 API 尚未在 `services/api` 落地**（本会话时 `services/api/src/modules/audit/` 目录已由 API agent
  建立但路由/契约未最终验证）。CLI 按需求文档 §6 契约实现，若服务端字段或 `unreadOnly` 布尔解析口径有出入，
  以 `services/api` 源码为准同步 CLI struct 的 `json:"..."` tag（`event` / `message` / `level` / `source` / `ip` /
  `detail` / `isRead` / `createdAt`）。
- `logs list --unread-only` 发送 `unreadOnly=true`；若服务端用 `z.coerce.boolean()` 等解析，`true` 是标准写法。
- `--level` 无简写是**有意**的：`-l` 冲突、`-t` 被全局占用，别「顺手」加回。
- `logs read` 不弹确认（非破坏性状态翻转），区别于 delete 类命令的 `confirm()`。
- 泛型 `List` 仍是自由函数（Go 禁止非泛型类型上的泛型方法），`ListAuditLogs` 只做薄封装。
