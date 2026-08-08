# 2026-08-08 CLI 标签功能实现

## 任务

在 `apps/cli` 实现 moment 标签功能（需求：`.ai/requirements/2026-08-05-moment-tags.md` 决策 ⑮：CLI 同批落地）。API 侧 `services/api` 的 tag 模块尚未实施，本批按需求文档契约先行实现 CLI。

## 实现内容

### 新增文件

| 文件 | 内容 |
|------|------|
| `internal/client/tag.go` | `TagEntry`（`id/name/momentCount/createdAt/updatedAt`）、`TagRelationEntry`、`AttachTagInput`、`TagOwnerTypeMoment` 常量；`ListTags` / `CreateTag` / `GetTag` / `RenameTag` / `DeleteTag` / `AttachTag` / `DetachTag` |
| `cmd/tag.go` | `serenique tag` 根命令：`list`（ID/名称/使用次数表格，分页工厂 + `--all`/`--json`）、`create`、`get`、`rename`、`delete`（confirm + `--force`）、`attach`/`detach`（`--owner-type`/`--owner-id`，ownerType 预校验） |
| `cmd/moment_tag.go` | `serenique moment tag add/remove/set` 嵌套子命令（参照 `moment_comment.go` 结构）；`parseTagIDList()`（逗号分隔、容忍空白、空段报错；空参数 = 清空全部） |
| `internal/client/tag_test.go`、`cmd/tag_test.go` | 路径/请求体/409 映射/confirm/注册断言测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `internal/client/moment.go` | `MomentEntry` 新增 `Tags []TagEntry`（json tag `tags`，与 API 同批落地保 `--json` round-trip）；新增 `ListMoments`（支持 `tag` 过滤，向后兼容——沿用 ListTasks 的 `url.Values` 签名）、`AddMomentTag` / `RemoveMomentTag` / `ReplaceMomentTags` |
| `internal/client/client.go` | 新增 `DeleteWithBody`（DELETE + JSON body，供 detach 契约 `{ownerType, ownerId}` 使用；沿用 Delete 的 `req.Close = true` 防 204-with-body 复用连接污染） |
| `cmd/moment.go` | `moment list` 新增 `--tag <tagId>` 过滤（`extraQuery` 注入，`--all` 翻页每页都带） |
| `cmd/root.go` | 注册 `tagCmd` |
| `cmd/moment_test.go`、`internal/client/moment_test.go` | tags 解码 round-trip、moment tag 三子命令、`--tag` 过滤、tagIds 数组/空数组测试 |

## 关键决策与坑

1. **detach 契约形态**：需求文档规定 `DELETE /api/tags/:id/detach` 携带 body `{ownerType, ownerId}`，但既有 `Client.Delete` 不带 body → 新增 `DeleteWithBody`（通用 helper，不是 tag 私有逻辑）。
2. **`MomentEntry.Tags` 必须本次落地**：Go json 解码静默丢弃未知字段，漏加会让 `moment get/list --json` 悄悄丢 tags，破坏 round-trip 契约（决策 ⑮ 明确要求同批）。
3. **ownerType 预校验**：`validateTagOwnerType` 仅接受 `"moment"`（对齐 API ownerType 注册表现状），拼写错误在本地报可操作中文错误而非等服务端校验——沿用 task status / ISO 时间的前置校验惯例。⚠️ 后续 API 注册新 ownerType（diary/event/task）时需同步此处。
4. **`moment tag set` 空参数语义**：`set m1 ""` = 空数组 = 清空全部（API 幂等集合语义）；`tagIds` 用 `[]string{}` 而非 nil（nil 会 marshal 成 `null`，破坏契约）。
5. **moment list 表格不加 tags 列**：现有列已很宽（内容 50 runes），任务允许「没空间就保持」；`--json` 经 struct 字段保证有 tags。
6. `cmd/tag.go` 有 gofmt 对齐问题已修复；`cmd/audit.go`、`cmd/event.go`、`cmd/helpers_test.go`、`internal/client/client_test.go` 存在**先于本次的** gofmt 漂移，未动。

## 验证（apps/cli 内，全部通过）

```sh
go build ./...       # ✓
go vet ./...         # ✓
go test -count=1 ./...  # ✓ cmd + internal 全绿（勿用 make test 替代）
make build           # ✓
```

## 遗留

- `internal/client/tag.go` 的 `TagRelationEntry` 解码假设：attach 返回 relation entry（对齐 blob attachments 先例）。若 API 落地时返回体不同（如 204 或包装形态），需同步调整。`AddMomentTag`/`AttachTag` 对无 data 响应已容错（`result` 留零值，命令层对空 `ID` 做条件输出）。
- `validateTagOwnerType` 硬编码 `"moment"`，API 注册新 ownerType 时需与 CLI 同步（见上）。
- API 侧 `services/api/src/modules/tag/` 尚未实施（需求状态 🔶设计中 → 待 API 落地联调）。
