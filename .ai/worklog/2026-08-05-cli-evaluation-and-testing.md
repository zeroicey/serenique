# CLI 评估与测试工作日志

日期: 2026-08-05

适用范围: `apps/cli/`（含与 `services/api` 工作区契约的对齐）

前置记录: `2026-08-04-cli-tool-development.md`（CLI 开发日志）、`2026-08-04-cli-tool-architecture.md`（CLI 架构）

## 背景与目标

08-04 新增 CLI（`apps/cli/`，Go + cobra）后，需要一次系统化评估：

- **完整测试**：确认整个流程（构建 → 配置 → diary/moment/blob 全命令 → `--json` 输出 → 退出码）能跑通。
- **架构评估**：检查设计不合理处（客户端、配置、输出、CLI↔API 契约对齐等）。

**评估机制**：双评审 agent 迭代循环 —— 每轮并行启动「测试 agent + 架构 agent」→ 双双通过即终止 → 否则由「修复 agent」修改并提交 → 进入下一轮。每轮最多 3 个 agent，循环最多 5 轮（收尾工作流 3 轮）。

## 过程时间线

### 主循环第 1 轮 → 提交 `c812db5`

| 评审 | 问题数 | 关键项 |
|------|:---:|------|
| 测试 | 9 | 全部错误被吞、进程一律 exit 0；`--config` 死旗标；`blob upload/download --json` 被进度文本污染；`blob link` 因缺 `BLOB_SIGNING_SECRET` 不可用 |
| 架构 | 14 | **critical**：moment 仍用旧字段 `content`，而工作区 API 已改名 `text`，moment create 完全不可用；错误吞没 exit 0；`--config` 从未读取；上传/下载进度污染 stdout；下载路径基于服务器 `originalName` 未净化（路径穿越/任意文件覆盖） |

修复内容：全部错误改 exit 1（`SilenceUsage`）；`--config` 经 `config.SetPath` 生效；moment 字段对齐 `text`；进度输出改 stderr、`--json` 只出单个 JSON；下载默认路径 `filepath.Base()` 净化；`BLOB_SIGNING_SECRET` 加入 `docker-compose.yml` + 本地 `.env`；CJK 表格对齐改用自研宽度计算；配置写入原子化 + `0600`；补单测（client 8 / config 9 / output 7）。

### 主循环第 2 轮（旧口径）→ 提交 `4b04bd5`

| 评审 | 问题数 | 关键项 |
|------|:---:|------|
| 架构 | 13 | 1 major（确认提示污染 `--json` stdout，且非交互 stdin 下 exit 0）；其余 minor/nit |
| 测试 | 8 | 2 个 critical 实为**环境问题**（Docker 里 API 容器是重构前旧构建、迁移 0005 未应用、MCP 服务崩溃循环），非 CLI 缺陷 |

**用户指令（范围收敛）**：旧容器/MCP 崩溃不用管，**只评估 CLI**。重启工作流并更新口径：环境/API/MCP 问题一律不计入 CLI 失败，CLI 契约以 `services/api` 工作区源码为准。

> 调度插曲：第 2 轮修复 agent 工作到一半被我停止，暂存区混入它改的 `services/mcp/src/tools/moment.tools.ts`（越界）。已还原该文件，只把 CLI 改动抢救提交为 `4b04bd5`（confirm 提示改 stderr、EOF 视为取消、`truncateRunes` 按 rune 截断防 CJK 乱码、`SilenceErrors` 单一错误渲染）。

### 新口径主循环

| 轮 | 测试 | 架构 | 修复提交 |
|----|:---:|:---:|------|
| 1 | ✅ PASS（3 minor/nit） | 14（1 major：`--json` 下明文 token 打到 stdout） | `4e7c6ce`（token 掩码、预 printer 错误 JSON 化等） |
| 2 | ✅ PASS（2） | 13（2 major：`blob attachments` 短 ownerId 崩溃；`make test` 漏跑 cmd 包） | `68bf079`（attach 健壮性、上传/JSON 错误语义） |
| 3 | ✅ PASS（2） | ⚠️ **pass=true 但含 1 major**（流式传输无超时、context 永不取消会永久挂起） | 未触发（口径不一致，见下） |

### 收尾工作流（严格复核）

发现迭代 3 的架构 agent「报了 major 却返回 pass=true」自相矛盾，且该轮未跑修复 agent。据此收紧通过标准为 **pass=true 且无任何 critical/major**，并启动收尾：

| 阶段 | 结果 |
|------|------|
| 种子修复 | `c2487b7`：信号取消传输（`signal.NotifyContext`）+ `ResponseHeaderTimeout`、baseurl 预校验、下载 Content-Length 校验、`--json` 预扫描改进 |
| 复核第 1 轮 | 测试 2（1 major：delete 后传输层 `Unsolicited response` 日志污染 stderr）、架构 8（1 major：坏 baseurl 锁死配置修复流程）→ 修复 `2a257cb`：delete 用 `Connection: close`、解除配置修复锁 |
| 复核第 2 轮 | 架构 ✅（8 minor/nit，无阻塞）；测试 agent 因 **API 402 Insufficient Balance** 失败 |
| 充值后续跑 | 复用缓存 + 重跑测试复核 → 测试 ✅（2 minor/nit）→ **`final_clean: true`** |

## 遇到的坑

1. **评审口径不一致**：架构 agent 在报出 major 问题的同时返回 `pass=true`，导致循环提前终止、问题未修复。→ 通过标准收紧为「pass=true 且无 critical/major」，且 `hasBlocking()` 显式检查 severity。
2. **API 402 Insufficient Balance**：账户模型额度耗尽，5 个 agent 失败（`agents_error=5`）。充值后用 `resumeFromRunId` 续跑：未变更的 agent 调用从缓存回放，只重跑失败的那个。
3. **修复 agent 越界改 MCP**：被 `git restore --staged` + `checkout` 还原（MCP 不在范围内）。
4. **Shell 工作目录漂移**：`cd apps/cli` 后 git 相对路径报 `pathspec did not match`，一度误判文件状态。用绝对路径 / `git -C` 解决。
5. **工作流脚本被截断**：首次提交脚本只有 TEST_PROMPT 常量，无执行逻辑，0 agent 即结束。重写完整脚本（含循环、schema、汇总）后正常。
6. **docker API 容器陈旧**：`diary get` 等返回 404，重建 `api` 服务（工作区代码）后才恢复 E2E 能力。

## 最终状态

- **结论**：`final_clean: true`，测试 + 架构双审通过，无 critical/major。
- **提交链**（CLI）：`eb50df8`（原始）→ `c812db5` → `4b04bd5` → `4e7c6ce` → `68bf079` → `c2487b7` → `2a257cb`。其间穿插用户 API 提交 `67cf2c0 feat(api): support moment media attachments`。
- **工作区**：`apps/cli` 干净；`services/api` 未提交重构（moment/blob 相关）原封未动；MCP/迁移/容器均未触碰（符合范围要求）。
- **质量**：`go build ./...`、`go vet ./...`、`go test -count=1 ./...` 全绿（cmd、internal/client、internal/config、internal/output 四包）。

## E2E 验证覆盖（均已通过）

- 配置：`init`（交互/非交互/EOF 报错）、`config`/`config set`/`config path`（token 掩码、0600 权限、flag>env>file 优先级、`--config`、`SERENIQUE_CONFIG_DIR`）
- diary：create（含 `--date`、重复日 409）、list（page/page-size/json）、get（404 exit 1）、update、delete（拒绝/确认/`--force`）
- moment：create（`--text`/`-m`，500 字上限：501 拒/500 收）、list、get、delete、attach（sort-order 透传）、detach
- blob：upload（单/多/glob/去重/文件不存在）、list（`--mime-type`/分页/json）、info（图片尺寸、SHA-256）、download（默认名/`--output`/`--force` 覆盖/`--download`/checksum 逐字节一致/404 无残留）、link（`--expires-in` 与默认 900s，签名 URL 返回精确字节）、delete（拒绝/确认/`--force`/有引用 409/404）、attach（diary/moment 类型限制提示）、attachments、detach、cleanup（拒绝/`--force`/json）
- 契约：所有 `--json` 调用 stdout 只输出单个合法 JSON 文档（进度/确认在 stderr）；错误路径 exit 非零；`--version` 正确

## 剩余可打磨项（非阻塞，全部 minor/nit）

测试侧 2 项：`--json` 模式下拒绝确认的 stderr 非纯净 JSON 文档；cobra 内建参数/未知命令错误为英文。

架构侧 11 项：`--download` 标志无可观察效果；批量上传整体失败仍输出 success 形状 JSON；`init` 只传 `--baseurl`/`--token` 之一时另一字段静默写默认值；table 模式若干 `fmt.Printf` 绕过 output 抽象；`--date` 缺客户端校验；SIGINT 中断传输提示「context canceled」不友好；超大响应错误文案；`confirm()` 仅认 `y`/`Y`；下载未校验 SHA-256；`--version --json` 非 JSON 包裹；`blob list` 表格不截断 `OriginalName`。

## 对下一次会话的提示

- **余额不足**时不要空转：工作流 agent 会 402，用 `resumeFromRunId` 续跑（未变调用从缓存回放）。
- **严格通过标准**：`pass=true` 且 issues 无 critical/major，不要信任 reviewer 自报的 pass。
- **环境是已知范围外问题**：docker 旧容器、迁移 0005、MCP 崩溃由用户自己处理，勿当作 CLI 缺陷修复或提交。
- **CLI 契约以 `services/api` 工作区源码为准**（moment 字段是 `text`），不是运行中的容器。
- 若要继续清剩余 minor/nit，见 `2026-08-05-cli-evaluation-decisions.md` 与 `2026-08-05-cli-tool-architecture-updates.md`。

## 参考

- 架构更新（定稿）: `../architecture/2026-08-05-cli-tool-architecture-updates.md`
- 决策记录: `../decisions/2026-08-05-cli-evaluation-decisions.md`
- CLI 使用文档: `apps/cli/README.md`
