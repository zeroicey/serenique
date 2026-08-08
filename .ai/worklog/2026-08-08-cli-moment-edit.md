# CLI 闪念编辑（moment edit）

日期: 2026-08-08

领域: `apps/cli`（Go + cobra）

关联: 移动端 moment 编辑同日落地（`2026-08-08-mobile-moment-edit.md`）——本改动是 CLI 端同步。

## 背景

API 已新增 `PUT /api/moments/:id`（body `{"text": ...}`，1–500 字，响应完整 `MomentEntry`，成功消息「闪念更新成功」，404「闪念不存在」）。MCP 已停更，未触碰 `services/mcp`。

## 改动

### 新增 `internal/client/moment.go`（此前 moment 没有类型化 client 文件）

- `MomentEntry` / `MomentAttachmentEntry` / `MomentBlobEntry` / `MomentCommentEntry` 四个类型从 `cmd/moment.go` **迁移**到 client 包（json tag 与 `services/api` 源码对齐，逐字未变）。
- `UpdateMoment(ctx, id, text)` → `PUT /api/moments/{id}`，body `{"text": text}`，返回完整更新后的 `*MomentEntry`（对齐 task.go/event.go 的类型化方法模式）。

### `cmd/moment.go`

- 删除本地类型定义，改用 `client.*` 类型（create/get/list/attach + 泛型 listSpec 全部同步），消除「同一实体两套 struct」的契约漂移风险（AGENTS.md：后端字段改动要同步 CLI struct 的 json tag——现在只有一个地方）。
- 新增 `moment edit <id>` 子命令，流程：
  1. GET 当前闪念 → 404 在此处先失败（「闪念不存在」），不浪费一次确认；
  2. 当前正文打到 **stderr**（`当前内容: ...`），stdout 保持纯净；
  3. `helpers.confirm("确认更新闪念正文", false)` —— **必过确认，无 `--force` 旁路**（需求明确「修改正文必须过确认交互」）；非交互 stdin EOF → error → exit 非零；
  4. `apiClient.UpdateMoment` PUT；
  5. 输出：JSON 模式 `{"message":"闪念更新成功","data":<完整 MomentEntry>}`（attachments/comments 完整 round-trip）；table 模式 `✓ 闪念更新成功` + ID/内容/创建时间/更新时间。
- flag：`--text`/`-m`（-m 沿用 moment create 与 comment update 的短参；-c 已被根 --config 占用），`MarkFlagRequired`。
- 注册到 momentCmd（root.go 不动）。

### `cmd/moment_comment.go`

- `MomentCommentEntry` → `client.MomentCommentEntry`（机械替换）。

### 测试

- `internal/client/moment_test.go`（新）：PUT 路径/方法/body `{"text"}` 断言 + 响应解码；404 → `*APIError{Message:"闪念不存在", HTTPStatus:404}`。
- `cmd/moment_test.go`：edit 注册、`-m` 短参 + required 注解（对齐 comment 的 flag 契约测试）、GET→PUT 请求序列 + stderr 当前内容 + stdout `✓ 闪念更新成功`、JSON 模式 data 为 `*client.MomentEntry` 且 comments round-trip、EOF 确认取消（PUT 不达服务器）、404 不确认直接失败、PUT 500 错误传播。
- `cmd/commands_test.go` / `cmd/moment_test.go` 中旧类型引用同步为 `client.*`。

## 验证

```sh
cd apps/cli
make test        # go test ./...：cmd + internal 全绿
go vet ./...     # 干净
go build ./...   # 通过
```

`go test -count=1 ./...` 概要：

```
ok  github.com/zeroicey/serenique-cli/cmd
ok  github.com/zeroicey/serenique-cli/internal/client
ok  github.com/zeroicey/serenique-cli/internal/config
ok  github.com/zeroicey/serenique-cli/internal/output
```

新增 9 个测试全部 PASS（client 2 + cmd 7）。

## 硬契约符合性

- 错误 exit 非零：所有 RunE 失败路径返回 error，无吞错。
- stdout 纯净：结果走 `output.Printer`；当前内容/确认提示走 stderr（与 confirm() 同一通道）。
- 确认交互：`helpers.confirm()`，EOF 视为取消 → error。
- `--json`：单文档 stdout，data 为完整 MomentEntry。
- 契约以 `services/api` 源码为准：`text` 字段、`PUT /api/moments/:id`、消息文案均核对 moment.types.ts / moment.handler.ts / moment.service.ts。
- 未触碰配置/传输/下载路径（无新增相关代码）。
- `moment edit` 无 `--force`：确认是需求强制项，未加旁路（与 delete 的 `--force` 语义不同，delete 默认确认但可跳过；edit 一律确认）。

## 对下一次会话的提示

- `cmd/moment.go` 与 `cmd/moment_comment.go` 现在使用 `client.MomentEntry` 系列类型；`cmd/diary.go` 仍是本地类型（diary 是最后一个未迁移到 client 类型化方法的模块）。若日后统一，参考 task/event/audit 模式，勿动 moment 的既有 json tag。
- `moment edit` 只更新正文（API `UpdateMomentSchema` 仅 `text` 一个字段）；附件/评论的编辑仍走 attach/detach 与 comment update。
