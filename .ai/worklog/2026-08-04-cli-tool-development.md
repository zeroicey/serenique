# CLI 命令行工具开发工作日志

日期: 2026-08-04

适用范围: `apps/cli/`（新项目）

## 背景与目标

Serenique 已有 `services/api`（REST API）和 `services/mcp`（AI 对接）。但仅靠 MCP 供 AI 调用不够，部分场景（如文件上传）困难。因此新增一个 CLI 命令行工具，供用户和 AI Agent 直接调用，目标效果类似 GitHub 的 `gh` CLI：

- 初次使用可 `init`，配置 `baseurl` 和 `token`
- 后续通过 CLI 直接请求 HTTP 服务
- 提供完善的 `help`，便于 AI 自学
- 覆盖各业务模块（diary、moment、blob）
- 支持文件上传/下载

当前后端无认证机制，认证相关逻辑先预留（token 配置 + `Authorization: Bearer` 头），现阶段直接请求 HTTP 服务即可。

## 技术选型决策

### 1. 项目位置 → `apps/cli/`

对比方案：

- **`services/` 下**: 当前 `services/` 下是服务端进程（api、mcp），CLI 是客户端不是服务端，语义不符。
- **`apps/` 下**: `apps/` 目录已存在且为空，显然预留给客户端应用。CLI 属于客户端，放这里语义准确。
- 根目录 `package.json` workspaces 是 `["services/*"]`，CLI 用 Go 不纳入 Bun 工作区，互不影响。
- 未来其他客户端（TUI、桌面端）也可放 `apps/` 下，目录约定统一。

**结论: `apps/cli/`**

### 2. 技术栈 → Go + cobra + yaml.v3

Go vs Rust 对比：

| 维度 | Go | Rust |
|------|:--:|:---:|
| 编译速度 | 极快 | 较慢 |
| 交叉编译 | 开箱即用 | 需 target 配置 |
| 标准库 HTTP/JSON/multipart | 完整成熟 | 需第三方 crate |
| CLI 框架 | cobra（K8s/gh 同款） | clap |
| 学习曲线 | 低 | 陡峭 |
| 参考案例 | `gh` 本身就是 Go 写的 | — |

关键理由：

- 对标产品 `gh` 用 Go + cobra，踩坑路径已被验证
- CLI 性能瓶颈在网络 I/O，Go 完全够用
- `mime/multipart` + `net/http` 原生支持文件上传
- 单二进制分发，`make build-all` 一条命令交叉编译多平台
- AI 自行调用和调试时，Go 编译速度快，迭代体验好

**结论: Go 1.22+ + `github.com/spf13/cobra` + `gopkg.in/yaml.v3`**

不引入 Viper：配置结构简单（两个字段），cobra `PersistentFlags` 处理命令行 flags、yaml.v3 处理文件、`os.Getenv` 手动处理环境变量即可，避免 Viper 的隐式魔法。

## 开发过程时间线

1. **探索 API**: 通读 `services/api/src/modules/*/{router,handler,types}.ts`，完整梳理 20 个端点、统一响应格式 `{success, message, data, error}`、multipart 上传字段名 `file`。
2. **规划**: 设计命令树、配置结构、HTTP 客户端、输出格式，写入计划文档。
3. **搭建骨架**: `go mod init` → 目录结构 `cmd/` + `internal/{config,client,output}` → `main.go` → `Makefile`。
4. **实现基础设施**: `internal/config`（读写配置、优先级合并）、`internal/client`（统一请求/响应/错误）、`internal/output`（表格 + JSON 双模式）。
5. **实现命令**: root → init → config → diary → moment → blob（10 个子命令）。
6. **构建排错**: 修复 3 个编译错误（见"遇到的问题"）。
7. **端到端验证**: 启动 `services/api`（bun run dev），用 CLI 完成 diary/moment/blob 全 CRUD 测试。
8. **文档**: 编写 README（中文使用指南 + AI Agent 使用指南）。

## 遇到的问题与解决

### 1. Go module 依赖下载超时

```
go: github.com/spf13/cobra: Get "https://proxy.golang.org/...": dial tcp ... i/o timeout
```

**原因**: 默认代理 `proxy.golang.org`（Google 服务器）网络不可达（国内网络环境）。

**解决**: 使用国内镜像 `goproxy.cn`：

```bash
GOPROXY=https://goproxy.cn,direct go mod tidy
```

后续 `go build` 本身不联网（依赖已入 `go.sum`），无需每次指定。

### 2. `multipart.Writer` 没有 `FormDataContentType()Len()` 方法

```go
req.ContentLength = fi.Size() + int64(writer.FormDataContentType()Len())
// 编译错误: syntax error: unexpected name Len in argument list
```

**原因**: 我误以为 `FormDataContentType()` 返回的对象有 `Len()` 方法，实际它返回的是 `string`。本想给 `Content-Length` 设置近似值。

**解决**: 直接删除这行。Go 的 `net/http` 对 `io.Pipe` reader 请求会在没有显式 Content-Length 时使用 chunked encoding，multipart 服务端（Hono `parseBody`）能正常处理。**注意: 这行删除后 `file.Stat()` 的 `fi` 变量变成了未使用，一并删除。**

### 3. 未使用的变量和导入

- `fi, err := file.Stat()` — 删除 ContentLength 逻辑后 `fi` 未使用 → 删除整段。
- `"path/filepath"` — 原本想用它处理下载默认文件名，实际下载默认名在命令层取原始文件名，`cmd/blob.go` 中未用到 → 删除导入和 `var _ = filepath.Base` 占位。

## 关键实现细节

### 统一响应解析

服务端所有响应形如 `{success, message, data?, error?}`。客户端 `do()` 统一处理：

- `204 No Content` → 直接返回 nil（删除类接口无 body）
- JSON 解析失败 → 报"服务器返回了意外的响应格式"
- `success == false` → 封装 `APIError{Message, HTTPStatus, Details}`，其中 `Details` 保留原始 `error` 字段（如 Zod issues）
- `success == true` → 把 `data` 反序列化进调用方传入的 `result` 指针

`data` 字段用 `json.RawMessage` 声明，由各命令按需解码为强类型 struct。

### 文件上传（流式）

用 `io.Pipe` + `multipart.Writer`，写入 goroutine 中流式拷贝文件内容到 pipe，避免大文件全量缓冲进内存：

```go
pr, pw := io.Pipe()
writer := multipart.NewWriter(pw)
go func() {
    defer pw.Close()
    defer writer.Close()
    part, _ := writer.CreateFormFile("file", filepath.Base(filePath))
    io.Copy(part, file)
}()
req, _ := http.NewRequestWithContext(ctx, "POST", url, pr)
req.Header.Set("Content-Type", writer.FormDataContentType())
```

字段名固定 `file`（与后端 `blob.handler.ts` 中 `body.file` 匹配）。

### 文件下载（流式）

`DownloadFile()` 请求 `GET /api/blobs/:id/file`，`io.Copy` 响应体直接写入输出文件，不整包读入内存。命令层先 `GET /api/blobs/:id` 取元数据拿到 `originalName`，`--output` 缺省时用它作为保存文件名。

### 配置优先级

```
CLI flag (--baseurl/--token) > 环境变量 (SERENIQUE_BASEURL/SERENIQUE_TOKEN) > 配置文件 > 默认值
```

另有 `SERENIQUE_CONFIG_DIR` 环境变量可覆盖配置目录（默认 `~/.serenique/`）。

### 输出双模式

- 默认: `text/tabwriter` 对齐表格（列表）/ 键值对（详情），中文对齐良好
- `--json` 全局 flag: 结构化 JSON，供 AI 和脚本消费
- 通过 `output.Printer` 接口抽象，命令层不关心渲染细节

### 删除安全

diary/moment/blob delete、blob detach、blob cleanup 默认交互确认，`--force`/`-f` 跳过。

### 命令注入模式

`cmd/root.go` 在 `PersistentPreRunE` 中解析配置并注入全局变量 `apiClient` / `printer` / `resolvedConfig`。各子命令 RunE 直接使用。**注意: `init` 命令在 `PersistentPreRunE` 中被跳过**（它自身创建配置，不应依赖 apiClient）。

## 端到端验证记录

本地 API（`services/api`，bun run dev，端口 3000）已运行，全部通过：

| 命令 | 结果 |
|------|------|
| `serenique --help` 完整命令树 | ✓ |
| `serenique diary create -m "..."` | ✓ |
| `serenique diary list`（表格） | ✓ |
| `serenique diary list --json` | ✓ |
| `serenique diary get <id>`（键值对） | ✓ |
| `serenique diary update <id> -m "..."` | ✓ |
| `serenique diary delete <id> -f` | ✓ |
| `serenique moment create/list/delete` | ✓ |
| `serenique blob upload <file>`（流式上传） | ✓ |
| `serenique blob info <id>`（含 SHA-256/尺寸） | ✓ |
| `serenique blob download <id> -o <path>`（内容校验一致） | ✓ |
| `serenique blob list`（MIME 类型/大小格式化） | ✓ |
| `serenique blob delete <id> -f` | ✓ |
| `serenique config` 展示配置 | ✓ |

测试用的 blob/moment 均已通过 `-f` 删除清理，未污染数据。

## 最终产物

- 二进制: `apps/cli/bin/serenique`，6.9 MB（`-s -w` stripped，Go 1.26）
- 14 个源文件，21 个可执行命令
- `.gitignore` 已加入 `apps/cli/bin/`

## 对下一次会话的提示

- **网络**: 拉 Go 依赖需 `GOPROXY=https://goproxy.cn,direct`（国内环境）。
- **模块依赖**: 新增模块（如 drive）只需 3 步：`internal/client/drive.go` 加类型化方法 → `cmd/drive.go` 加 cobra 命令 → `cmd/root.go` 注册。无需动其他文件。
- **后端无 auth**: token 相关字段已预留但实际为空，后端加认证后无需改 CLI 架构。
- **可能的下一步**: `serenique version`、shell 自动补全（`completion` 子命令）、多 profile 支持（`--profile` + profiles 配置段）、交互式编辑器（`--editor` 打开 `$EDITOR`）、进度条。

## 参考

- 详细架构见 `../architecture/2026-08-04-cli-tool-architecture.md`
- CLI 使用文档: `apps/cli/README.md`
