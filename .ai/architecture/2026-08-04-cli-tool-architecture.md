# Serenique CLI 工具架构设计

日期: 2026-08-04

适用范围: `apps/cli/`

## 背景

Serenique 有 `services/api`（REST API）和 `services/mcp`（AI 对接）。新增 `apps/cli/` 提供命令行客户端，目标：

- 供用户和 **AI Agent** 直接调用 Serenique API
- 支持 `init` 初始化配置（baseurl、token）
- 覆盖全部业务模块（diary、moment、blob）
- 支持文件上传/下载
- 完善 help 系统，方便 AI 自学

对标 GitHub `gh` CLI。认证当前预留，后端无鉴权。

## 技术栈

| 项 | 选型 | 理由 |
|----|------|------|
| 语言 | Go 1.22+ | 编译快、交叉编译简单、标准库 HTTP/multipart 成熟、`gh` 先例 |
| CLI 框架 | `github.com/spf13/cobra` | K8s/gh 同款，help 生成、flag 解析完善 |
| 配置解析 | `gopkg.in/yaml.v3` | 轻量；结构简单不需 Viper |
| 表格输出 | `text/tabwriter`（标准库） | 零依赖，中文对齐良好 |

依赖总量 4 个（cobra、pflag、mousetrap、yaml.v3），二进制 6.9 MB（stripped）。

## 项目结构

```
apps/cli/
├── main.go                  # 入口: cmd.Execute()
├── go.mod                   # module github.com/zeroicey/serenique-cli
├── Makefile                 # build / build-all / install / clean / test / lint
├── README.md                # 中文使用 + AI 使用指南
├── cmd/                     # Cobra 命令定义（一个业务模块一个文件）
│   ├── root.go              # 根命令 + 全局 flags + 配置注入
│   ├── init.go              # serenique init
│   ├── config.go            # serenique config [show|set|path]
│   ├── diary.go             # serenique diary
│   ├── moment.go            # serenique moment
│   └── blob.go              # serenique blob
└── internal/
    ├── config/config.go     # 配置读写 + 优先级合并
    ├── client/client.go     # HTTP 客户端（统一响应解析、上传下载）
    └── output/output.go     # Printer 接口 + Table/JSON 实现
```

**依赖方向**: `cmd` → `internal/{config,client,output}`。`internal/` 下三包互相独立，`cmd` 是唯一编排层。

## 配置设计

### 文件: `~/.serenique/config.yaml`

```yaml
baseurl: http://localhost:3000   # API 地址（无尾部斜杠）
token: ""                        # 认证令牌（预留，后端无鉴权时为空）
```

- 目录可用 `SERENIQUE_CONFIG_DIR` 环境变量覆盖
- 文件权限 `0600`，目录 `0700`

### 优先级（高 → 低）

```
1. CLI flags (--baseurl / --token)
2. 环境变量 (SERENIQUE_BASEURL / SERENIQUE_TOKEN)
3. 配置文件 ~/.serenique/config.yaml
4. 默认值 (baseurl=http://localhost:3000, token="")
```

由 `config.Resolve(cfg, baseURLOverride, tokenOverride)` 实现。

### 命令

- `serenique init` — 交互式提示 baseurl/token，支持 `--baseurl`/`--token` 非交互
- `serenique config` — 查看（token 打码显示）
- `serenique config set <key> <value>` — 修改（支持 baseurl、token）
- `serenique config path` — 显示文件路径

## HTTP 客户端设计

`internal/client/client.go` — 单一 `Client{BaseURL, Token, HTTPClient}`。

### 统一响应解析（`do()`）

服务端统一响应格式（见 `services/api/src/shared/response.ts`）:

```json
{ "success": bool, "message": string, "data"?: any, "error"?: any }
```

```go
type APIResponse struct {
    Success bool            `json:"success"`
    Message string          `json:"message"`
    Data    json.RawMessage `json:"data,omitempty"`   // 延迟解码
    Error   json.RawMessage `json:"error,omitempty"`
}
```

`do(req, result)` 处理流程：

1. `204 No Content` → 返回 nil（删除类接口）
2. JSON 解析失败 → `服务器返回了意外的响应格式 (HTTP xxx)`
3. `!Success` → 返回 `*APIError{Message, HTTPStatus, Details}`（Details 保留原始 error，如 Zod issues）
4. 成功 → `json.Unmarshal(apiResp.Data, result)`

### 认证注入

`setHeaders()`: `Authorization: Bearer <token>`，token 为空则不发送。后端加鉴权后无需改动客户端架构。

### 文件上传（流式）

```go
pr, pw := io.Pipe()                      // 避免大文件全量入内存
writer := multipart.NewWriter(pw)
go func() { ... io.Copy(part, file) ... }()
req.Header.Set("Content-Type", writer.FormDataContentType())
```

- 字段名固定 `file`（匹配后端 `blob.handler.ts` 的 `body.file`）
- 因 body 是 `io.Pipe`，Go 自动用 chunked encoding；Hono `parseBody` 正常处理

### 文件下载（流式）

`DownloadFile(blobID, outputPath, forceAttachment)`：

- `GET /api/blobs/:id/file`（`forceAttachment` 时加 `?download=1`）
- `io.Copy` 响应体直接写文件
- HTTP ≥400 时尝试解析统一响应格式并返回 APIError

### 端点 → 方法映射

| Client 方法 | 对应端点 |
|------------|----------|
| `Get(path, query, result)` | 所有 GET |
| `Post(path, body, result)` | 所有 POST |
| `Put(path, body, result)` | PUT /api/diaries/:id |
| `Delete(path)` | 所有 DELETE |
| `UploadFile(ctx, path, filePath, result)` | POST /api/blobs/upload |
| `DownloadFile(ctx, blobID, outputPath, force)` | GET /api/blobs/:id/file |

## 输出设计

`output.Printer` 接口（`PrintTable` / `PrintKeyValue` / `PrintSuccess` / `PrintError` / `PrintMessage`），两种实现：

- **TablePrinter**（默认）: `text/tabwriter` 对齐；列表用表头表格，详情用键值对，操作成功用 `✓ 消息`，错误用 `✗ 错误: ...`（stderr）
- **JSONPrinter**（`--json`）: 结构化 JSON，适合 AI/脚本

命令层通过 `printer := output.NewPrinter(useJSON)` 使用，不感知渲染细节。

## 命令树

```
serenique
├── init                          # 交互式初始化配置
├── config                        # 配置管理
│   ├── config set <key> <value>
│   └── config path
├── diary                         # 日记管理
│   ├── diary list                # --page -p, --page-size -l
│   ├── diary create              # --content -m (必填), --date -d
│   ├── diary get <id>
│   ├── diary update <id>         # --content -m (必填)
│   └── diary delete <id>         # --force -f
├── moment                        # 闪念管理
│   ├── moment list               # --page -p, --page-size -l
│   ├── moment create             # --content -m (必填, ≤500字)
│   └── moment delete <id>        # --force -f
└── blob                          # 文件管理
    ├── blob upload <file...>     # 多文件
    ├── blob list                 # --page, --page-size(默认20), --mime-type
    ├── blob info <id>
    ├── blob download <id>        # --output -o, --download(强制附件)
    ├── blob link <id>            # --expires-in -e (默认900, ≤604800)
    ├── blob delete <id>          # --force -f
    ├── blob attach <blob-id>     # --owner-type/--owner-id(必填), --role -r, --display-name -n, --sort-order
    ├── blob attachments <blob-id>
    ├── blob detach <attachment-id>  # --force -f
    └── blob cleanup              # --force -f
```

全局 flags（cobra PersistentFlags，所有子命令可用）:

| Flag | 简写 | 说明 |
|------|------|------|
| `--baseurl` | `-b` | 覆盖 API 地址 |
| `--token` | `-t` | 覆盖认证令牌 |
| `--json` | `-j` | JSON 输出 |
| `--config` | `-c` | 指定配置路径（已预留，当前 Load 忽略 flagConfig） |

删除类命令默认交互确认，`--force` 跳过 —— 保护数据和脚本安全两不误。

## 配置注入机制

`cmd/root.go` 的 `PersistentPreRunE` 是核心钩子：

```go
PersistentPreRunE: func(cmd, args) error {
    if cmd.Name() == "init" { return nil }   // init 自己创建配置
    cfg, _ := config.Load()
    resolvedConfig = config.Resolve(cfg, flagBaseURL, flagToken)
    apiClient = client.NewClient(resolvedConfig.BaseURL, resolvedConfig.Token)
    printer = output.NewPrinter(useJSON)
    return nil
}
```

子命令直接用包级全局 `apiClient` / `printer` / `useJSON`。这是当前实现的取舍 —— 简单直接，但全局变量使单元测试命令层稍难；如需可改为 Context 传递或显式注入。

## AI 对接设计

CLI 设计为 AI Agent 可自主调用：

1. **可发现性**: 每个命令的 `Long` 描述都带中文示例，`--help` 即文档
2. **机器可读**: `--json` 全局 flag，输出稳定 JSON
3. **可确定性**: 删除类操作 `--force` 跳过交互确认，适合无人值守
4. **环境感知**: `SERENIQUE_BASEURL`/`SERENIQUE_TOKEN` 环境变量，无需改文件
5. **学习闭环**: AI 首次 `serenique --help` 探索命令树 → 具体命令 `--help` 看示例 → 执行

## 测试覆盖与验证

- `make build` — 编译
- `make build-all` — 交叉编译 5 平台
- 单元测试: 目前无（Go 侧），可补 `internal/config`、`internal/client`（httptest）、`internal/output`
- 端到端: 启动 `services/api`（`bun run dev`）后，用 CLI 走通 diary/moment/blob 全流程

```bash
cd services/api && bun run dev        # 起服务
cd apps/cli && make build
./bin/serenique init --baseurl http://localhost:3000
./bin/serenique diary create -m "测试"
./bin/serenique blob upload test.jpg
```

## AI 修改指南

后续 AI 接手此 CLI 时的约束：

1. **新增模块**（如 drive）: `internal/client/drive.go`（类型化方法）→ `cmd/drive.go`（cobra 命令）→ `cmd/root.go` 注册。三步，不触碰其他文件。
2. **响应结构变化**时先改 `APIResponse` 和相关 struct，命令层尽量保持薄。
3. **上传字段名 `file`** 与后端强耦合，改后端时同步改 `UploadFile`。
4. **token 打码**：`config` 展示时用 `maskToken()`，不要在输出中泄露完整 token。
5. **配置文件**权限必须保持 `0600`。
6. **flagConfig（--config）** 目前只是声明了全局 flag，`config.Load()` 尚未真正使用它；如需支持任意路径配置文件，需把 `flagConfig` 传入 `config.Path()`。当前 `SERENIQUE_CONFIG_DIR` 已能覆盖目录。
7. **中文帮助**保持双语文档：命令短描述 + 示例都要，AI 依赖它自学。
8. `init` 命令不经过 `PersistentPreRunE`，不要在里面依赖 `apiClient`。

## 后续可选演进

- `serenique version`（ldflags 已注入 version/commit/date，仅差命令）
- `serenique completion bash|zsh|fish`（cobra 内置，注册即用）
- 多 profile（`--profile` + config 增加 profiles 段，类似 gh `--host`）
- `serenique auth login/logout`（后端有鉴权后）
- 交互式编辑器 `--editor`（日记长内容）
- 上传/下载进度条（`schollz/progressbar/v3`）
- `--no-color`、`--quiet` 输出控制
- 命令层单元测试（解除全局变量依赖后）
