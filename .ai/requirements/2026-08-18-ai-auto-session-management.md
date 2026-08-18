# AI 对话自动会话管理（单一对话流：自动切换/压缩 + 手动斜杠命令）

- 日期：2026-08-18（评审定稿 2026-08-18，fresh-context reviewer）
- 状态：✅已实施（后端 + Web + Flutter 三端 2026-08-18；评审定稿后实施，含 B-1/B-2 修复轮）
- 范围：`services/api`（ai 模块，WS 协议 + 服务层）+ `apps/web`（/ai）+ `apps/mobile`（Flutter /ai）
- 前置记录：`.ai/requirements/2026-08-09-ai-agent-module.md`（会话实例模型/WS 协议）、`.ai/requirements/2026-08-18-ai-message-lazy-load.md` + `.ai/decisions/2026-08-18-ai-pagination-front-anchor.md`（分页 anchor 游标）、决策链 D-016~D-019、评审（reviewer 2026-08-18：B1~B3/S1~S4/G1~G3）

---

## 1. 背景与目标

**核心形态（2026-08-18 用户拍板）**：宁序前端是**单一对话流**（像 ChatGPT/Claude 那种单聊天框）——**无会话侧边栏/列表/切换/删除 UI**。用户永远只看链尾最新对话，回看历史 = 向上滚动（时间线连续加载）。

**痛点**：① 手动建会话麻烦；② 长对话上下文膨胀回答质量下降；③ 隔段时间回来旧上下文过时（提示词带当前日期，日期敏感回答按旧上下文会错）。

**目标**：用户在输入框直接聊，后台无感决定「继续当前会话」还是「自动开新会话 / 压缩」；前端只收到系统 marker 进入时间线；另提供手动斜杠命令 `/new`、`/compact`（对齐 Hermes 惯例，输入框斜杠命令即拦截，不进模型）。

**两条自动触发规则（已定）**：

- (a) **时间间隔**：距最后一条消息 ≥ 24h → 自动新建会话（链到旧会话）
- (b) **上下文溢出**：上下文接近窗口上限 → 就地压缩（业界主流 + pi SDK 已内置）

**核心原则**：

- 无感、无 UI 切割：不弹窗、不打断；marker 是用户看到的唯一会话边界提示
- 连续性：用户视角是一条**持续对话**；切新会话/压缩是时间线上的「中间穿插提醒」
- **链延续不重置时间线**（评审 B2）：链尾自动切换/`/new` 时前端**保留已加载时间线**，只追加/补齐边界 marker，不整条清空重建

## 2. 业界做法调研（2026-08-18）

**上下文满 → 就地压缩是主流**：

- **Claude**：官方推荐 server-side compaction——接近窗口上限时服务端自动把旧内容摘要化替换、同一对话继续；可配 input_tokens 阈值 trigger、自定义摘要指令（来源：docs.claude.com/en/docs/build-with-claude/compaction）。
- **ChatGPT**：自动压缩旧消息为摘要；跨会话事实靠独立 Memory 层。
- **DeepSeek / Kimi / Gemini 网页版**：长对话自动折叠/摘要旧内容。
- **agent 类（Claude Code/Cursor/pi）**：自动 compact 是标配（pi：`shouldCompact = contextTokens > contextWindow - reserveTokens`，保留最近 `keepRecentTokens`，压缩条目入历史）。

**时间维度**：主流 chat 产品几乎不做「隔太久自动开新会话」；但 Serenique 是个人生活助手（状态在 DB 可经工具重查），旧上下文隔天过时，「间隔过久自动开新段 + 干净上下文」是合理差异化，且内联在单一对话流里无需干预。

| 触发 | 业界做法 | 本需求（已定） |
| --- | --- | --- |
| 上下文溢出 | 就地压缩（保留连续性） | 就地压缩（pi SDK 已内置且默认开启） |
| 间隔过久 | 手动 New chat / Memory 层 | 自动新建会话（链式，24h，状态靠 DB 工具重查） |

## 3. 需求要点

### 3.1 自动切换（服务端判定）

- **(a) 时间间隔**：连接恢复与 `prompt` 入口统一判定——当前会话**最后一条消息 `.timestamp`** 距今 ≥ 24h → 自动建新会话（链到旧会话）；判定基于末条消息 timestamp（**非 `SessionInfo.modified` 文件 mtime**，压缩写盘会刷新 mtime 造成误判，评审 S2）；空会话不触发
- **(b) 上下文溢出**：交给 pi SDK auto-compaction（默认开启，prompt 前/turn 后自动触发），服务端把 `compaction_start/end` 事件转发前端渲染 marker

### 3.2 手动斜杠命令（前端拦截，不进模型）

- 输入 `/new` → 拦截并发送已有 `new_session` WS 消息（在链尾开新段，时间线出现「已开启新会话」marker，**不重置时间线**）
- 输入 `/compact` → 拦截并发送新增 `compact` WS 消息 → 服务端 `session.compact()`，经 `compaction_start/end` 事件回显「已压缩」marker + 摘要；compact 失败（Nothing to compact / Already compacted）务必 catch 后回 `error`/轻提示，不让异常逃逸（评审 S3）
- 未知斜杠命令（`/foo`）→ **前端本地提示「未知命令」且不发送**（已统一，评审 G3；同步决策链 D-019）
- 命令仅小写精确匹配

### 3.3 单一对话流 + 状态提醒（含评审 B2 契约定稿）

- **无会话侧边栏/列表/切换/删除 UI**；前端永远渲染链尾最新对话
- 自动/手动切换不打断输入、不弹窗
- **链延续 vs 切换两语义**（协议层区分）：
  - **链延续**（`chainContinuation: true`）：链尾自动切换 / `/new` —— 前端**保留已加载时间线**，仅追加边界 marker，**不重置 messages/anchor**
  - **切换**（无 UI 时实际不发生）：完整重置（保留给调试/多端验证）
- 时间线 marker：
  - 新会话：「已开启新会话」（自动带原因：因间隔过久；手动 `/new` 不带）
  - 压缩：「已压缩早期对话」+ 摘要（可展开）——**真实压缩摘要**（来自 `compactionSummary` 消息/`compaction_end.result.summary`）
  - marker 随分页加载/重连稳定复现

### 3.4 跨会话消息加载（合并流分页，协议契约见 §5）

- 用户时间线 = 链合并流：链上各会话 RenderMessage 按链结构顺序拼接，会话边界插入派生的「已开启新会话」marker
- 向上滚动加载更早消息时跨会话边界继续取上一会话尾部；front-anchor 分页语义推广到合并流
- **压缩 = 分页基线重同步点（评审 B1）**：见 §5.4

## 4. 现状技术盘点（改什么，含评审实证）

**pi SDK 0.84.1 已验证可用**：

- `AgentSession.compact(customInstructions?)` 公开 API，返回 `CompactionResult`（summary/firstKeptEntryId/tokensBefore）——确认
- 事件 `compaction_start`（reason: manual|threshold|overflow）、`compaction_end`（reason/result/aborted/willRetry/errorMessage）——**手动 `/compact` 与 auto 都发这两事件**，接线成立——确认
- auto-compaction 默认开启（`getCompactionEnabled() ?? true`）、`reserveTokens ?? 16384`、`keepRecentTokens ?? 20000`；`shouldCompact = contextTokens > contextWindow - reserveTokens`；触发点集成在 SDK（prompt 前/turn 后），服务端无需自己写判定——确认
- 压缩后 `session.messages` 出现 `role:'compactionSummary'`（`{ summary, tokensBefore, timestamp }`）——确认
- **`SessionManager.create(..., options?.parentSession)` → `SessionHeader.parentSession`**；`SessionInfo.parentSessionPath` 已由 `SessionManager.list` 暴露（serenique `listSessions()` 现丢弃）——**链落盘推荐用它**（评审 S1）
- `SessionManager.appendCustomEntry` 存在但**不采用**（评审 S1：无原生 parentSession 简洁）

**当前缺口（待改）**：

- `forwardEvents` 未转发 `compaction_start/end`
- `toRenderMessages` 丢弃 `compactionSummary`
- 无 24h（末条 timestamp）判定
- 会话无链（parentSession）概念、无链尾注册表 → 无法跨会话加载 / 多标签不产生分叉
- WS 协议无 `compact`、无自动切换/压缩重同步应答类型
- 前端输入框无斜杠命令拦截

## 5. 技术方案方向（评审定稿）

### 5.1 链模型（纯线性 append-only）

- 链 = 有序会话 `[S0, S1, …, Sn]`（Sn=链尾/当前）。会话创建时传 `options.parentSession = 当前链尾`（SDK 原生，随 jsonl 落盘、跨重启可重建）
- 进程内**链尾注册表**（评审 B3）：`chainHead: sessionId` 存进程共享 Map；自动切换走 `getOrCreateChainHead()`（promise 去重，同 `sessionRegistry` 模式）——两标签页同时判定 24h 时**合并到同一新会话**，不产生分叉；切换/建链后对连到旧链尾的 conn 统一重指向并推送更新

### 5.2 合并流 + 分页推广（协议契约）

- 合并流 = `concat( toRender(S0) + [marker] + toRender(S1) + [marker] + … + toRender(Sn) )`，下标 `0..M-1`；「已开启新会话」marker 为**派生元素，计入合并下标**（位置固定在会话边界，随链稳定）
- 初始下发：取合并流**尾部** `INITIAL_PAGE_SIZE` 条 + 该批起点作 `anchor`（对单会话的 `sessionPagination` 语义直接作用到合并流）
- `load_more`：`nextOlderPage(merged, limit, anchor)` → `[anchor-limit, anchor)` + `nextAnchor` + `total` + `hasMore`；批次跨会话边界时 marker 自然出现在批次内；`totalMessageCount` = 合并流长度
- 重连/`session_ready`：沿链回溯组装合并流 + 尾页 + anchor（**合并流 = 纯函数，重连可稳定重建**）

### 5.3 链延续协议（评审 B2）

- `session_switched` 增 `chainContinuation: boolean`（链尾切换/`/new` = true）+ `reason: 'auto_timeout' | 'manual'`；前端 **chainContinuation=true 时不重置 messages/anchor**，只追加边界 marker + 补齐新链尾尾页（若有新消息）

### 5.4 压缩 = 分页基线重同步点（评审 B1，最实质阻断）

- 问题：压缩会折叠**单会话**内消息前缀（旧 RenderMessage 合并成一条 compactionSummary），该会话段及之后的合并下标下移、total 缩小 → 客户端持有的 anchor 失效，`load_more` 会取到错位/重叠批次
- 契约：`compaction_end` 后服务端用**新合并流重算**（尾页 + total + 新 anchor），按**链延续语义**下发给相关连接（`session_compacted` 或复用 `session_switched`+`chainContinuation`+`compacted` 标志）。客户端处理：保留新尾页；此前已加载的、位于新 anchor 之前的**该压缩会话**具体消息，替换为「已压缩摘要」可展开项——语义上与「就地压缩」一致（更早内容本就被摘要替代）
- 更早链段（S0..S_{n-1}）不受当前链尾压缩影响（合并流前缀稳定）；仅链尾会话增长/压缩影响尾段
- 回归用例：`ai.service.test.ts` 补「压缩后相对新 total 的 load_more 不重叠、anchor 正确」

### 5.5 24h 判定（评审 S2）

- 从内存实例 `session.messages` 取最后一条 `.timestamp`（user 或 assistant）；`now - lastTs >= 24h` 且会话非空 → 切新链尾
- 连接恢复（onOpen 恢复会话）与 `prompt` 入口共用同一判定函数

### 5.6 多标签页（评审 B3）与协议增量

- 见 §5.1 链尾注册表
- c2s：`compact`
- s2c：`compaction_start` / `compaction_end`（转发 SDK 事件）；`session_switched` 增 `chainContinuation` + `reason`；压缩重同步事件（§5.4）
- `RenderMessage` 增 `kind`：`'system'`（派生切换 marker）/ `'compaction'`（真实压缩摘要，可展开 detail=summary）——两条路径区分（评审 S4）
- `list_sessions` / `switch_session` / `delete_session`：**前端无入口即不暴露**；`switch_session` 在单一对话流下**停用**（消除「链中间段增长 → anchor 失效」风险，评审 G2）

## 6. 已定决策（用户拍板 + 评审定稿）

| # | 决策点 | 结论 |
| --- | -------- | ------ |
| 1 | 产品形态 | 单一对话流：无会话侧边栏/列表/切换/删除 UI，永远显示链尾最新，对齐 AI 机器人 |
| 2 | 上下文溢出 | 就地压缩（pi SDK auto-compaction 默认开启）+ 转发 `compaction_start/end` + 渲染 `compactionSummary` 摘要 marker |
| 3 | 时间间隔阈值 | 24h（判定=末条消息 `.timestamp`；连接恢复+prompt 统一判定；常量可提 env） |
| 4 | 间隔切换后新会话摘要 | 不带（状态在 DB，AI 经工具重查） |
| 5 | 用户时间线 | 链式连续加载（合并流 + 边界 marker），**链延续不重置时间线**（B2） |
| 6 | 压缩契约 | **压缩 = 分页基线重同步点**：compaction_end 后下发改算的尾页+total+anchor，按链延续语义，已压缩旧消息替换为摘要（B1） |
| 7 | 链落盘 | SDK 原生 `options.parentSession`（非 custom entry）；进程内链尾注册表 + promise 去重（S1/B3） |
| 8 | 手动命令 | `/new` `/compact` 前端斜杠命令拦截转 WS；未知命令本地提示且不发送（G3）；compact 失败 catch |
| 9 | 多标签页 | 链尾注册表复用，多连接跟随同一链尾，不产生分叉（B3） |
| 10 | 协议 | `session_switched` 增 `chainContinuation`+`reason`；`RenderMessage.kind` 区分 system/compaction（S4/B2）；`switch_session` 停用（G2） |

## 7. 剩余实现注意

1. 合并流 `toRenderMessages` 对「会话内压缩摘要」与「派生边界 marker」的组装顺序/下标语义：marker **计入合并下标**（保证 anchor 稳定性），实施时以 §5.2 为准
2. `chainContinuation` 下前端「追加新尾页」与「保留旧时间线」的边界：实施时给 Web/Flutter store 一套最小状态机（保留已加载消息 + 追加 marker + 拼接新尾页）
3. 实测跑一次长会话触发 auto-compaction，确认压缩事件负载与 `compactionSummary` 在合并流的实际形态（需求 §4 已有 SDK 实证，实施时二次确认一次）

## 8. 非目标

- 不做跨用户/多租户会话隔离（单用户当前）
- 不做语音输入
- 不做「摘要回写 DB」的长期记忆层（无新表；DB 状态由 AI 工具查询获得）
- 不做会话列表/切换/删除 UI（单一对话流）
- 不动 `services/mcp`（冻结）
