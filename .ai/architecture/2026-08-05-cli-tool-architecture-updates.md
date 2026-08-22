# CLI 工具架构更新（评估后定稿）

日期: 2026-08-05

适用范围: `apps/cli/`

前置文档: `2026-08-04-cli-tool-architecture.md`（原始设计，本文标注其被取代/修正的部分）

> 说明: 08-05 的双评审迭代评估对 CLI 做了多轮修复，原始架构文档中多处描述已过时。本文记录**定稿后的现状**与相对 08-04 的变更点。后续 AI 以此为准，遇冲突以本文为准。

## 变更总览

| 08-04 设计 | 08-05 定稿 | 变更原因 |
| ----------- | ----------- | --------- |
| `text/tabwriter` 表格对齐 | 自研 CJK 显示宽度对齐（`output/` 内手动 padding） | tabwriter 按字节计列宽，CJK 中文会错位 |
| `--config`/`-c` 仅声明未使用 | `config.SetPath(flagConfig)` + `PersistentPreRunE` 真正生效 | 修复「文档声明但完全不生效」缺陷 |
| 下载默认路径直接取 `originalName` | `filepath.Base(originalName)` 净化 + 空/`.` 兜底 | 修复路径穿越/任意文件覆盖 |
| 错误被吞、进程一律 exit 0 | 全部错误 exit 1（`SilenceUsage` + `Execute()` 统一渲染） | 脚本/AI 无法感知失败 |
| 上传/下载进度打到 stdout | 进度/确认/错误全部走 stderr；`--json` 模式 stdout 只出单个 JSON 文档 | 修复 `--json` 输出被污染 |
| token 明文输出 | `maskToken()` 掩码，含 `--json` 模式 | 凭据泄露风险（`--json` 是给 AI/脚本的模式） |
| moment 字段 `content` | 对齐工作区 API 契约 `text`（`--text`/`-m`） | 后端字段改名 |
| 传输用 `context.Background()`，无超时 | 根 context 由 `signal.NotifyContext(os.Interrupt, SIGTERM)` 派生 + `ResponseHeaderTimeout` | 服务端卡住时 CLI 永久挂起；Ctrl-C 漏删临时文件 |
| delete 走 keep-alive | `client.Delete` 设 `req.Close = true`（`Connection: close`） | 消除 204-with-body 引发的传输层 `Unsolicited response` stderr 噪声 |
| 配置写入直接写文件 | 原子写（temp + rename）+ 读写 `0600` + chmod symlink 安全 | 崩溃/并发写入损坏配置；token 明文权限 |
| 列表预览按字节截断 | `truncateRunes()` 按 rune 截断 | 防 CJK 截断产生非法 UTF-8 |
| `List` 与 `Resolve` 为自由函数 | `Resolve` 改为方法；`List` 保持泛型自由函数（Go 禁止泛型方法） | 惯用性 + 编译约束 |
| 单测缺失 | 5 个测试文件（cmd、client、config、output）全绿 | 评估期补足，`make test` 不再空转 |
| 版本号 ldflags 注入但不可见 | `--version`/`-v` 可查（`cmd.SetVersion`，main 为唯一权威源） | 补全功能缺口 |

## 当前分层结构

```
apps/cli/
├── main.go                 # 入口: cmd.SetVersion + cmd.Execute()
├── Makefile                # build / build-all / install / clean / test / lint
├── README.md               # 中文使用 + AI 使用指南
├── cmd/                    # Cobra 命令定义
│   ├── root.go             # 根命令 + 全局 flags + 配置注入 + 单一错误渲染
│   ├── init.go / config.go / moment.go / blob.go
│   ├── helpers.go          # confirm() / truncateRunes()（命令层公共助手）
│   ├── commands_test.go / helpers_test.go
└── internal/
    ├── config/             # 配置读写 + 优先级合并 + SetPath
    ├── client/             # HTTP 客户端（统一响应解析、上传下载、校验）
    └── output/             # Printer 接口 + Table/JSON 实现
```

依赖方向不变：`cmd` → `internal/{config,client,output}`，三包互相独立。

## 关键设计定稿

### 错误处理契约（重要）

- 所有命令 `RunE` **返回 error**，绝不吞错。`Execute()` 统一渲染一次：printer 可用时走 printer（`--json` 下为 stderr 的 `{"error":...}`），否则纯文本 `✗ 错误: ...`。
- `rootCmd.SilenceUsage = true` + `SilenceErrors = true`：usage 不叠在错误上，cobra 不再额外打印 `Error:` 行（防止双重打印）。
- **确认交互**：`confirm()` 提示写到 stderr；非交互 stdin（管道/CI）EOF 视为「未确认」并返回错误 → exit 非零。脚本永远不会把「跳过确认」误判为成功。
- 优先级：错误/进度/确认 → stderr；stdout 只放「结果」（table 或单个 JSON 文档）。

### 输出层（`internal/output`）

- `Printer` 接口：`PrintTable` / `PrintKeyValue` / `PrintSuccess` / `PrintError` / `PrintMessage`，Table 与 JSON 双实现。
- 表格对齐：自研按 **CJK 显示宽度**（中文按 2 列计）padding，替代 tabwriter。
- `--json` 模式：每个命令 stdout 输出**单个**合法 JSON 文档，进度/确认全部 stderr。
- 已知遗留：`JSONPrinter.PrintTable/PrintKeyValue` 在 JSON 模式下不可达（保留为接口完整性）；table 模式有少量 `fmt.Printf` 绕过 Printer（见决策记录 D 遗留）。
- 已知遗留：预 printer 阶段的 `--json` 检测是 `os.Args` 文本预扫描（`flagJSONRequestedFrom`），对 `--json`/`-j` 有效；`-fj` 组合简写、`-m "--json"` 等边界有误判（有注释与单测覆盖常见情形）。

### 配置层（`internal/config`）

- 优先级：CLI flags > 环境变量（`SERENIQUE_BASEURL`/`SERENIQUE_TOKEN`）> 配置文件 > 默认值。
- `--config`/`-c` 经 `config.SetPath` 生效；目录可用 `SERENIQUE_CONFIG_DIR` 覆盖。
- 文件权限 `0600`（Load 与 Save 都校验/设置），目录 `0700`；写入原子（temp + rename）；chmod 防 symlink 追踪。
- `Resolve` 已是 `*Config` 的方法；**baseurl 在 `NewClient`/`Resolve` 时 `url.Parse` 预校验**（空 scheme/host 早失败并给中文提示，不再等到请求时报 `http: no Host`）。
- token 展示一律 `maskToken()`。

### 客户端层（`internal/client`）

- `do()` 统一处理统一响应包裹 `{success, message, data?, error?}`：`204` → nil；JSON 解析失败 → 明确报错；`!success` → `APIError{Message, HTTPStatus, Details}`；成功 → 反序列化 `data`。
- **传输超时与取消**：上传/下载用根 context（`signal.NotifyContext`，Ctrl-C/SIGTERM 触发取消，defer 的临时文件清理得以执行）；传输 client 设 `ResponseHeaderTimeout`（首字节 30–60s 内必须到，大 body 仍可流式），防止服务端卡死永久挂起。
- **下载校验**：`io.Copy` 到临时文件后原子改名；若 `resp.ContentLength >= 0` 则校验字节数一致；清理部分文件；最终路径前再用 `os.Lstat` 做存在性检查（防 TOCTOU 类误判）。
- **上传**：`io.Pipe` 流式 multipart（字段名 `file`），goroutine 泄漏在请求构造失败时可控；失败路径有清理。
- **delete**：`req.Close = true`，规避 204-with-body 的传输层日志噪声。
- **下载默认名**：`filepath.Base(originalName)` 净化，拒绝路径穿越。
- 大响应体读取设 size cap（`doWithClient`）。

### 命令层（`cmd`）

- 全局 flags：`--baseurl/-b`、`--token/-t`、`--json/-j`、`--config/-c`；另有 `--version/-v`。
- 命令树新增/修正：`moment get <id>`（含附件表）、`moment attach/detach`、`blob attach` 拒绝 moment owner-type 并给指引、`blob link` 在 `BLOB_SIGNING_SECRET` 未配置时优雅报错、`blob download --force`（覆盖）。
- moment 字段为 `text`（`--text`/`-m` 均支持）。
- `--json` 模式 token 相关输出均掩码。

### 测试

- `cmd/commands_test.go`、`cmd/helpers_test.go`、`internal/client/client_test.go`、`internal/config/config_test.go`、`internal/output/output_test.go`。
- `go test -count=1 ./...` 全绿；`go vet` 干净。
- `make test`（`go test ./internal/...`）注意：**只跑 internal 包，会漏掉 cmd 包**——完整验证请用 `go test ./...`。

## AI 修改指南（更新）

1. **错误必须 exit 非零**：任何 `RunE` 失败都要返回 error，绝不用 `return nil` 吞掉。
2. **stdout 纯净**：结果（含 `--json` 单文档）走 stdout；进度/确认/错误走 stderr。新增输出逻辑优先用 `output.Printer`，不要裸 `fmt.Printf` 打 stdout。
3. **token 掩码**：任何输出（含 `--json`）不得泄露完整 token，用 `maskToken()`。
4. **契约以 `services/api` 工作区为准**：moment 字段是 `text`；改后端字段时要同步改 CLI struct 的 `json:"..."` tag。
5. **下载路径净化**：默认文件名必须 `filepath.Base()`，禁止直接 `os.Create(originalName)`。
6. **传输必须可取消 + 有超时**：新增大文件功能沿用 `signal.NotifyContext` 根 context + `ResponseHeaderTimeout`；不要在传输路径用 `context.Background()`。
7. **配置安全**：保持 `0600` + 原子写 + symlink 安全；新增字段后同步 `Resolve`、优先级与 `config set` 白名单。
8. **确认交互**：用 `helpers.confirm()`，它保证 stderr 提示 + EOF 视为取消。
9. **CJK 截断**：用 `truncateRunes()`，不要按字节切片。
10. **新增模块**（如 drive）：`internal/client/drive.go` 加类型化方法 → `cmd/drive.go` 加 cobra 命令 → `root.go` 注册；复用列表/删除工厂模式减少复制。
11. **`List` 保持泛型自由函数**：Go 不允许非泛型类型上的泛型方法（编译器报 `method must have no type parameters`），不要试图转成方法。
12. **`--json` 预扫描**改动时要同步更新 `flagJSONRequestedFrom` 的单测与注释；它只保证文档化写法（`--json`/`-j`）。
13. **验证命令**：改完跑 `cd apps/cli && go build ./... && go vet ./... && go test -count=1 ./...`（勿用 `make test` 替代，它会漏 cmd 包）。

## 已知遗留（评估收尾的非阻塞 minor/nit）

- `--download` 标志无可观察效果（`blob download` 默认 inline 时也应体现区别）。
- 批量上传整体失败时 `--json` 仍输出 success 形状信封（仅字段语义问题，退出码已正确非零）。
- `init` 只传 `--baseurl`/`--token` 之一时，非交互 stdin 下另一字段静默写默认值。
- table 模式少量 `fmt.Printf/Println` 绕过 `output.Printer` 抽象（主要是 init/config 成功输出）。
- `--date` 缺客户端格式校验（服务端会拒绝）。
- SIGINT 中断传输时提示 `context canceled` 不够友好（应提示「已取消」）。
- 超大响应错误文案称「已被截断」但实为拒绝。
- `confirm()` 只认 `y`/`Y`，`yes` 视为拒绝。
- 下载未校验 blob 的 SHA-256（上传时已校验 checksum 一致）。
- `--version --json` 输出 cobra 纯文本而非 JSON 信封。
- `blob list` 表格不截断 `OriginalName`。

详细取舍记录见 `../decisions/2026-08-05-cli-evaluation-decisions.md`。
