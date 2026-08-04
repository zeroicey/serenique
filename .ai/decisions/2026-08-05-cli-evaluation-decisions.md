# CLI 评估与改进决策记录

日期: 2026-08-05

适用范围: `apps/cli/`（评估流程 + 技术改进）

前置记录: `2026-08-04-blob-storage-module.md`（Blob 模块决策）、`2026-08-04-cli-tool-development.md`、`2026-08-04-cli-tool-architecture.md`

## 评审流程决策

### D1 评估范围：只评估 CLI

- **背景**：测试中发现「Docker API 容器是旧构建、迁移 0005 未应用、MCP 服务崩溃循环」等问题。
- **决策**：用户明确指示——旧容器/MCP 崩溃不用管，**只评估 CLI**。这些是环境/API 侧事实，不计入 CLI 失败，不修复、不提交。
- **落地**：评审 prompt 内置 `SCOPE_NOTE`，测试/架构 agent 只能将环境问题作为 summary 中的一行信息提及；CLI 契约以 `services/api` 工作区源码为准（不是运行中的容器）。
- **Why**：防止环境噪音污染 CLI 评估、防止修复 agent 越界改动 MCP/迁移/未提交的 API 重构。
- **How to apply**：后续任何 CLI 评估都沿用此范围；如需评估 API/MCP 单独立项。

### D2 双评审 agent 迭代协议

- 每轮：测试 agent + 架构 agent **并行** → 双双通过即终止 → 否则修复 agent（修改 + 提交）→ 下一轮；主循环最多 5 轮。
- 评审返回结构化结果 `{pass, issues:[{severity, file, title, detail, suggested_fix}], summary}`；修复返回 `{resolved_all, commit_sha, changed_files, unresolved}`。
- 修复 agent 只提交自己改的文件（先记录既有 dirty 路径，不 `git add` 无关改动）；不 push。

### D3 严格通过标准（关键修正）

- **背景**：迭代 3 的架构 agent 报出 major 问题却返回 `pass=true`，导致循环提前终止、问题悬置。
- **决策**：通过标准收紧为 **`pass=true` 且 issues 中无任何 `critical`/`major`**。脚本用 `hasBlocking()` 显式检查 severity，不信任 reviewer 自报的 pass。
- **Why**：reviewer 的 pass 判断可能与 severity 标签矛盾；防御性检查兜底。
- **How to apply**：所有评审循环的终止条件都必须是「pass 且无 critical/major」。

### D4 余额不足的续跑策略

- **背景**：账户模型额度耗尽，agent 连续 402 失败。
- **决策**：不空转；充值后 `Workflow({scriptPath, resumeFromRunId})` 续跑，未变更的 agent 调用从缓存回放，只重跑失败的那个。
- **Why**：避免重复花额度、复用已验证结果。
- **How to apply**：工作流因 402/中断失败时，先 `journal.jsonl` 确认进度再续跑。

## 技术决策（评审驱动）

### D5 错误必须 exit 非零，禁止吞错

- 原始实现所有命令 `return nil` 吞掉 API 错误，进程一律 exit 0，脚本/AI 无法感知失败（测试 critical + 架构 major）。
- 改为所有 `RunE` 返回 error，`Execute()` 统一渲染一次，`SilenceUsage` + `SilenceErrors` 防双重打印。

### D6 stdout 纯净契约

- 进度/确认/错误 → stderr；stdout 只放结果。
- `--json` 模式 stdout 只输出**单个合法 JSON 文档**（上传批量结果是一个文档 `{message, data:{success, failed, results}}`）。
- Why：AI/脚本直接解析 stdout；`--json` 被进度文本污染是双评审同时命中的问题。

### D7 token 掩码（含 `--json`）

- `init`/`config`/`config set token` 的 JSON 输出与表格输出都经 `maskToken()`。
- Why：`--json` 是给 AI/脚本消费的模式，明文 token 等于凭据泄露。

### D8 下载路径净化（防路径穿越）

- 默认下载文件名 `filepath.Base(originalName)`，空/`.` 兜底。
- Why：服务器可下发 `originalName: "../../pwn.txt"`，直接 `os.Create` 可任意覆盖文件。E2E 已验证 `../../pwn.txt` 只落到当前目录 `pwn.txt`。

### D9 传输可取消 + 有超时（不永久挂起）

- 根 context 由 `signal.NotifyContext(os.Interrupt, syscall.SIGTERM)` 派生，命令用 `cmd.Context()`；传输 client 设 `ResponseHeaderTimeout`（30–60s）。
- 附带收益：Ctrl-C 时 defer 清理 `.serenique-dl-*` 临时文件。
- Why：`context.Background()` 永不取消 + 无超时 = 服务端卡死则 CLI 永久挂起；SIGINT 默认直接杀进程漏临时文件。

### D10 delete 用 `Connection: close`

- `client.Delete` 设 `req.Close = true`。
- Why：后端删除接口返回「204 带 body」（`Res.noContent`），keep-alive 通道上 Go 传输层打 `Unsolicited response received on idle HTTP channel` 到 stderr，污染脚本输出。

### D11 baseurl 预校验

- `NewClient`/`Resolve` 用 `url.Parse` 校验解析后的 baseurl，空 scheme/host 早失败并给中文提示。
- Why：坏配置（如 `http://`、裸 host）原等到请求时才报 `http: no Host in request URL`，对 AI 配置场景太迟太隐晦；也避免配置修复流程被坏 baseurl 锁死。

### D12 下载 Content-Length 校验

- `io.Copy` 后若 `resp.ContentLength >= 0` 校验字节数一致，防 chunked 提前断流的损坏文件被静默保存为「完整」。

### D13 配置安全：原子写 + `0600` + symlink 安全

- Save 用 temp + rename 原子写；Load/Save 都保证 `0600`；chmod 防 symlink 追踪。
- Why：token 可能入配置；崩溃/并发写入不得损坏配置；`Load` 已 symlink 安全，`Save` 不能与之不一致。

### D14 文本截断按 rune（CJK 安全）

- `truncateRunes()` 按 rune 数量截断并追加 `...`。
- Why：按字节切片会切在 CJK 多字节字符中间，产生非法 UTF-8（列表预览/详情都受影响）。

### D15 moment 字段以工作区契约为准（`content` → `text`）

- CLI 从 `content` 改为 `text`（`json:"text"`、create 发 `{"text":...}`）。
- Why：后端把字段改名为 `text`（含迁移 0005），旧容器不匹配但工作区源码是权威。

### D16 `--config`/`-c` 落地

- 经 `config.SetPath(flagConfig)` + `PersistentPreRunE` 对所有命令（含 `init`）生效。
- Why：原始实现「注册了但从未读取」，文档承诺与行为不符。

## 明确拒绝 / 延期的决策

| 提议 | 结论 | 理由 |
|------|------|------|
| `client.List` 改为方法 `(c *Client) List[T]` | **拒绝（不可实现）** | Go 禁止非泛型接收者上的泛型方法，编译器报 `method must have no type parameters`；`List` 保持泛型自由函数并加注释说明 |
| CommandCtx `{Client, Printer, UseJSON}` 线程化贯穿所有 `RunE` | **延期** | 需要动全部 handler 与测试底座，改动/回归风险高；当前包级全局局限在 cmd 包内且有文档 |
| 通用 `renderList[T]` 工厂（列表脚手架去重） | **延期** | 三个 list 的表头/行映射差异大，共享泛型反而不如各模块内明确；已抽 `attachmentBody`/`printDeleteResult` 等小助手 |
| 删除 `-l` 作为 `--page-size` 简写 | **拒绝** | 已文档化、跨模块一致，改动会破坏已有脚本 |
| `detach` 纳入 `deleteCommand` 工厂 | **拒绝** | 参数数/路径/提示均不同，工厂化收益低 |
| 修复 MCP / 应用迁移 0005 / 重建容器 | **拒绝（范围外）** | 用户明确不在 CLI 评估范围 |

## 遗留打磨项（非阻塞，见架构更新文档「已知遗留」）

- `--download` 无效果、批量上传失败仍 success 形状、`init` 单 flag 静默默认值、table 模式裸 `fmt`、`--date` 无校验、SIGINT 提示、超大响应文案、`confirm()` 只认 `y`/`Y`、下载不校验 SHA-256、`--version --json` 非 JSON、`blob list` 不截断 `OriginalName`、拒绝确认时 stderr 非纯净 JSON、cobra 内建错误为英文。
- 若要清项，按 `2026-08-05-cli-tool-architecture-updates.md` 的「AI 修改指南」约束执行，完成后用 `go test -count=1 ./...` 全量验证。
