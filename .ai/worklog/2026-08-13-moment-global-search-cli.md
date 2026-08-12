# 2026-08-13 — Moment 全局搜索 CLI 端（`moment list --query`）

实现需求文档 `.ai/requirements/2026-08-13-moment-global-search.md` 第 4/5.3 节 + 决策 ⑮：`serenique moment list --query "beijing"` 把 `q` 参数传给 `GET /api/moments`（服务端按 text / pinyin / pinyin_initial 三列 ILIKE 搜索）。本次只做 CLI，不动后端契约（后端 `q` 已由 api-agent 同批实施：`ListMomentSchema.q` = `z.string().trim().min(1).max(100).optional()`，additive）。

## 改动（apps/cli，未提交）

- **`cmd/moment.go`**：
  - 新增 `momentListQuery string` 状态变量
  - `moment list` 的 `listSpec.extraQuery` 追加 `if momentListQuery != "" { q.Set("q", momentListQuery) }`——与 `--tag` 同款条件式（空串不传，additive、旧服务端兼容）
  - 注册 `--query`/`-q` flag，帮助文案中文「按关键词搜索（支持中文/拼音/英文）」
  - `long` 帮助补 `--query` 示例（含与 `--tag` 正交组合示例）
- **`internal/client/moment.go`**：`ListMoments` 的 doc 注释更新，记录 `q` 搜索契约（additive、与 tag 正交、CLI 原样透传关键词不做拼音转换）
- **`cmd/moment_test.go`**：新增 `TestMomentListSendsQueryFilter`（表驱动：仅关键词 / 空串不传 q / 中文关键词 / q+tag 正交组合，用 `r.URL.Query()` 解码断言，规避 CJK URL 编码细节）+ `TestMomentListQueryFlagRegistered`（守卫 `-q` 简写不与 root 持久 flag `-b/-t/-j/-c` 冲突）
- **`apps/cli/README.md`**：闪念管理节补 `--query` 示例

## 关键决策：没有 `ListMomentsParams` 结构体，按 codebase 现有模式实现

需求文档与任务书都写「`ListMomentsParams` 加 `Query *string`（json tag `q`）」，但**该结构体在 codebase 里不存在**（grep 全仓无 `ListMomentsParams`/`ListTasksParams` 等任何 params 结构体）。实际架构：

- 所有 list 命令走共享工厂 `paginatedListCommand[T]` + `listSpec.extraQuery func(q url.Values)`（helpers.go），additive 过滤（tag / mimeType / level / event）一律 `if x != "" { q.Set(...) }` 条件式
- client 层 `ListMoments(ctx, query url.Values)` 是薄封装，直通泛型自由函数 `List[T]`；moment list 命令本身根本不经 `ListMoments`，而是 `client.List[T]` + extraQuery

若照字面建 `ListMomentsParams` 结构体，要么改 `ListMoments` 签名破坏全仓统一模式，要么变成死代码。**故选按现有 extraQuery 模式实现**（`q` 以 `url.Values` 承载，与 tag/mimeType 完全一致），功能与验收标准（`--query` 接线正确、对照 api.ts 契约参数名 `q`）完全满足。任务书提到的结构体改动是建立在不存在的前提上，已在本文档记录。

## 验证

- `cd apps/cli && go build ./... && go vet ./... && go test -count=1 ./...` 全绿（4 包全过，-count=1 破缓存）
- `gofmt -l`：本次改动的 3 个文件干净；`go build -o /tmp/serenique . && serenique moment list --help` 确认 `-q, --query string  按关键词搜索（支持中文/拼音/英文）` 已注册
- 契约核对：后端 `ListMomentSchema.q`（trim+1..100）、web `api.ts` `ListMomentsParams.q?: string`、CLI 请求参数名 `q`——三端一致

## 坑 / 对下一次会话的提示

- **需求文档里的「ListMomentsParams」是理想化描述，Go codebase 实际没有 params 结构体**：CLI 的 list query 参数由 cmd 层 `extraQuery` 组装 `url.Values`，client 层只透传。后续给 CLI 加查询参数（如 blob mimeType、task status）照抄 `if x != "" { q.Set(...) }` 模式即可，勿新建 params 结构体
- **工作区有并行 agent 的未提交改动**（services/api 的 pinyin 列/q 搜索、apps/web 搜索框、bun.lock、requirements/README.md 状态行）：提交时只 stage 自己 apps/cli 的 4 个文件，勿误提交他人工作
- **`gofmt -l` 在 HEAD 就报了 6 个非本次改动文件**（cmd/audit.go、auth.go、event.go、token.go、helpers_test.go、internal/client/client_test.go）——历史遗留未格式化，非本次引入，勿顺手修（避免污染他人 diff）
- CLI `--query` 传原始关键词，不做 trim/拼音转换（服务端 trim + 三列 ILIKE；空白关键词 trim 后为空 = 全量列表）
- 需求文档 ⑰ 的测试分层（domain 纯函数单测 + 集成测试）是 api-agent 的活，CLI 侧只有接线单测
