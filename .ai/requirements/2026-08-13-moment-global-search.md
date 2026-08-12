# Moment 全局搜索需求文档

- 日期：2026-08-13
- 状态：✅已实施（2026-08-13 API + Web + Flutter + CLI 四端落地；typecheck / 单测 / 集成测试全绿。待 db:migrate 应用 0015 + 回填脚本执行后部署验收）
- 范围：`services/api`（moment 模块 + 拼音派生列 + `q=` 搜索参数）、`apps/web`（搜索框 UI）、`apps/mobile`（Flutter 搜索框 UI）、`apps/cli`（`moment list --query`）
- 前置记录：`2026-08-05-moment-tags.md`（additive Zod schema 先例）、`2026-08-05-service-layer-architecture.md`（分层架构）

---

## 1. 背景与目标

Moment（闪念）目前只能按时间倒序浏览，或按标签过滤（`?tag=`）。当闪念积累到数千条后，用户需要**全局搜索**来快速找到某条记录。

**核心需求**：一个搜索输入框，输入关键词即可过滤 moment 列表，搜索需同时支持：
- **中文**：输入「北京」匹配文本含「北京」的记录
- **拼音全拼**：输入「beijing」匹配「北京」
- **拼音首字母**：输入「bj」匹配「北京」
- **英文**：输入「meeting」匹配文本含「meeting」的记录

**已确认的关键方向**：搜索在**服务端**实现（不是客户端过滤已加载数据）——理由：
1. 「全局」搜索意味着要覆盖全部历史数据，客户端无限滚动只加载了部分页，过滤不完整；
2. 项目是多客户端（Web / Flutter / CLI），服务端实现一次，三端统一受益，无重复逻辑；
3. 拼音生成在服务端写入时完成（派生列），客户端零拼音库依赖，搜索体验（响应时间）可控。

搜索范围 v1 限定为 **moment 正文（`moments.text`）**；嵌套自评论（`moment_comments.content`）v1 不搜（见决策 ⑤）。

---

## 2. 数据模型（设计方向）

### moments 表新增两个拼音派生列

| 列 | 类型 | 说明 |
|----|------|------|
| `pinyin` | text NULL | 正文的中文转拼音**紧凑全拼**（无声调、无分隔符），英文/数字原样保留。例：「北京 meeting」→ `beijingmeeting` |
| `pinyin_initial` | text NULL | 正文的拼音**首字母**紧凑串，英文/数字原样保留。例：「北京 meeting」→ `bjmeeting` |

- **生成时机**：create / update 时由 service 层用 `pinyin-pro`（v3.28.2，实测验证）计算（`moment.domain.ts` 纯函数，保证可单测）。
- **精确配置（已实测验证）**：`pinyin-pro` 默认输出带声调 + 空格分隔（`'中文' → 'zhōng wén'`），且默认 `nonZh: 'spaced'` 会把英文逐字符打散（`'hello' → 'h e l l o'`）。派生列必须显式配置：
  ```ts
  import { pinyin } from 'pinyin-pro';
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  // 全拼列：'中文' → 'zhongwen'；'hello 中文' → 'hello zhongwen'
  full: normalize(pinyin(text, { toneType: 'none', separator: '', nonZh: 'consecutive', v: true })),
  // 首字母列：'中文' → 'zw'；'hello 中文' → 'hz'（英文首字母也收录）
  initial: normalize(pinyin(text, { pattern: 'first', toneType: 'none', separator: '', nonZh: 'consecutive', v: true })),
  ```
  四个选项缺一不可：`toneType: 'none'`（否则带声调含 `é`/`ǚ` 非 ASCII，ILIKE 匹配异常）、`separator: ''`（紧凑无空格）、`nonZh: 'consecutive'`（保留英文/数字原文而非逐字符打散）、`v: true`（`ü → v` 归一化，用户输入法打「lv」才能命中「吕」）。归一化 `replace(/\s+/g, ' ')` 因 consecutive 会保留原文空白（产生双空格）。
- **存储格式决策**：
  - `pinyin` 全拼用**紧凑格式**（`beijingmeeting`）而非空格分隔（`bei jing meeting`）——紧凑格式保证用户输入任意中间片段（如 `jing`）也能命中，且英文单词不被打散。
  - `pinyin_initial` 首字母串（`bjmeeting`）——覆盖「bj」这类首字母缩写输入。
  - 大小写统一存小写（搜索端用 `ilike` 大小写不敏感）。
- **存量数据**：新列对历史记录为 NULL，需要**一次性回填脚本**（`scripts/backfill-moment-pinyin.ts`，对齐 `bootstrap-user.ts` 脚本模式）遍历全部 moments 计算拼音并 UPDATE。回填脚本在迁移后由部署 runbook 执行（见决策 ⑥）。
- **不新增搜索专用索引**：单用户应用 moments 量级为千级，`ILIKE '%kw%'` 全表扫描毫秒级，无需索引。若未来数据量暴涨，可加 pg_trgm GIN 索引（作为可选优化，不在本需求范围）。对齐项目「moments 表无索引」现状。

### 不新增表

- 不建独立搜索索引表 / 不引入外部搜索引擎（Meilisearch 等）——单用户量级过杀。

---

## 3. 业务规则

- **`q` 参数**：可选，`trim()` 后非空才启用搜索过滤；为空 = 全量列表（与现有行为一致）。
- **搜索匹配逻辑**（`WHERE` 三条件 OR，参数化绑定）：
  ```
  moments.text        ILIKE '%q%'   -- 中文 / 英文原文
  OR moments.pinyin        ILIKE '%q%'
  OR moments.pinyin_initial ILIKE '%q%'
  ```
  中文「北京」→ 命中 text；拼音「beijing」→ 命中 pinyin；首字母「bj」→ 命中 pinyin_initial；英文「meeting」→ 命中 text。
- **通配符转义**：用户输入可能包含 `%`、`_`、`\`（ILIKE 通配符），必须转义为字面量，否则会被当通配符导致错误命中。实现上用 Drizzle 参数化 + 显式 escape（`ilike(col, pattern, { escapeChar })` 或等价写法）。
- **`q` 长度上限**：`max(100)`（对齐 location `SearchQuerySchema` 的 keyword ≤50 惯例放大；moment 正文 ≤10000，100 足够覆盖正常关键词）。
- **搜索与现有参数可组合**：`q` 与 `page`/`pageSize`/`tag` 正交组合（如 `?q=beijing&tag=<tagId>` 标签+关键词双过滤），additive schema 模式与 tag 先例一致。
- **响应结构不变**：仍返回 `{ items, total }`，`total` 为过滤后的真实总数；分页语义不变。
- **拼音列不出现在 API 响应中**：`MomentEntry` 不暴露 `pinyin` 字段（内部实现细节，避免污染对外契约；mappers 转换时排除）。
- **多音字处理**：`pinyin-pro` 默认取常用读音（最大概率分词消歧，实测「银行」→ `yín háng`、「行走」→ `xíng zǒu` 均正确，官方准确率 99.846%）。`multiple: true` 选项**仅对单字生效**（整条文本无效），`type: 'all'` 可返回每字所有读音但会膨胀派生列——**v1 接受常用读音方案**，用户搜索用任一读音一般能命中大部分情况；不引入多读音存储（复杂度不成比例）。已在设计文档注明该局限。
- 用户可见文案中文（与现有模块一致）。

---

## 4. API 路由（设计方向）

### 复用现有列表接口，加 additive `q` 参数

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/moments?q=<keyword>&page=&pageSize=&tag=` | 列表 + 搜索过滤。`q` 为 additive 可选字段，**不新增独立 `/search` 路由**（对齐 tag 先例决策 ⑧：复用 ListMomentSchema 扩展） |

- `ListMomentSchema` 增加：`q: z.string().trim().min(1).max(100).optional()`
- `moment.service.ts` 的 `list()` 增加 `q` 分支：构造 `or(ilike(text, ...), ilike(pinyin, ...), ilike(pinyin_initial, ...))` 并入 where；与现有 tag 过滤（`inArray`）通过 `and()` 组合。
- **CLI**：`moment list --query "beijing"` 复用同一参数（**本次实现**）。CLI 的 `ListMomentsParams` 加 `Query *string`（json tag `q`）即可，契约与 API 同批对齐。
- **MCP 无需改代码**：`list_moments` 工具经 `ListMomentSchema.extend()` 自动获得 `q` 参数（对齐 tag 先例 ⑭）。
- **AI agent 消费**：`exports.ts` 导出面保持 `ListMomentSchema` 形态（`q` 字段自动流入），无需新增导出。

---

## 5. 前端 UI 设计（Web + Flutter）

### 5.1 Web 端（apps/web）

**位置**：`moment-list-page.tsx` 顶部（居中列 max-w-[600px] 内，与现有卡片列同宽），新增搜索输入框。不放入顶栏 `headerRight`（保持列表上下文，与无限滚动联动更自然）。

**交互设计**：
- **输入框**：shadcn `Input` + lucide `Search` 图标（绝对定位，复用 `moment-location-picker.tsx` 现有样式）+ 有内容时显示清除按钮（X）。
- **防抖**：`useDebouncedValue(keyword, 300)`（现成 hook）——输入停止 300ms 后才触发请求，避免每击键打一次 API。
- **查询接线**：
  - `api.ts`：`ListMomentsParams` 增加 `q?: string`，条件式拼进 searchParams（对齐 `audit/api.ts` 的条件 searchParams 模式）。
  - `queries.ts`：`useMoments(pageSize, keyword)` 把 keyword 纳入 queryKey：`['moments', keyword, pageSize]`——keyword 变化 → 新 queryKey → `useInfiniteQuery` **自动从第 1 页重新拉取**（天然重置，无需手动 setPage）。现有 `invalidateQueries({ queryKey: ['moments'] })` 前缀失效逻辑依然兼容。
  - 可选：`placeholderData: keepPreviousData`（对齐 `audit-page.tsx`）防止切换关键词时列表闪烁。
- **空态**：搜索无结果时显示「未找到匹配的闪记」占位（复用现有空态组件样式）。
- **搜索中的状态**：输入框旁可显示 loading spinner（isFetching 时）。
- **URL 状态**：v1 **不**将 keyword 同步到 URL（项目无列表 URL 状态先例，保持简单）；后续需要可分享搜索链接时再加 `useSearchParams`（已确认 react-router v8 可用）。

### 5.2 Flutter 端（apps/mobile）

**位置**：`moment_list_page.dart` 的 AppBar 下方新增搜索栏（Material 3 风格，`SearchBar` 或 `TextField` + 前缀 Search 图标 + 清除按钮）。

**交互设计**：
- **状态管理**（Riverpod 3）：新增 `momentSearchKeywordProvider`（`StateProvider<String>`）+ 防抖（`Timer(300ms)` 或 `debounce` 工具）更新实际搜索词 provider。
- **查询接线**：
  - `moment_api.dart`：`listMoments` 增加 `query` 参数（拼到 query string）。
  - `moment_providers.dart`：`momentListProvider`（`AsyncNotifierProvider`）的查询参数改为依赖搜索词，搜索词变化 → 重新请求（重置到第 1 页）；分页逻辑复用现有 load-more。
- **空态**：无结果显示「未找到匹配的闪记」。
- 复用现有 `MomentCard` 渲染结果。

### 5.3 CLI

`moment list --query "beijing"` 输出过滤后的表格/JSON（复用现有 Printer）。`ListMomentsParams` 加 `Query` 字段（json tag `q`），条件式拼进请求。

---

## 6. 安全性考虑

- **SQL 注入**：搜索关键词通过 **Drizzle 参数化绑定**传入（`ilike` 生成 `$n` 占位符），绝不字符串拼接 SQL；`%` 通配符由转义逻辑处理而非拼接。
- **通配符注入**：`%` / `_` / `\` 在用户输入中作为**字面量**对待（转义），防止恶意 `%` 导致全表命中或 DoS。
- **输入长度限制**：`q` ≤100 字符，超长拒绝（Zod 校验，409/422 由统一错误处理）。
- **数据越权**：单用户设计，所有 moments 属同一用户，无跨用户泄露面；现有认证中间件（session/Bearer）自动保护新参数路径。
- **拼音列信息泄露**：`pinyin` 列不对外暴露（不进 `MomentEntry`），仅作为内部检索列；即使泄露也只是正文的拼音形式，无新增敏感信息。
- **客户端防抖**：Web/Flutter 均 300ms 防抖，避免高频击键打爆 API；单用户无速率限制需求。
- **回填脚本**：只读 + UPDATE 幂等（可重复执行），不删除数据。

---

## 7. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 搜索实现位置 | **服务端搜索**（非客户端过滤已加载数据）——全局覆盖 + 三端统一 |
| ② | 拼音方案 | **后端派生列**：moments 表加 `pinyin`（紧凑全拼）+ `pinyin_initial`（首字母）两列，写入时 pinyin-pro（v3.28.2）计算，搜索 ILIKE 匹配。配置：`toneType:'none'` + `separator:''` + `nonZh:'consecutive'` + `v:true` + 空白归一化 |
| ③ | 搜索 API 形态 | **复用 `GET /api/moments` 加 additive `q` 参数**，不新增独立 `/search` 路由（对齐 tag 先例） |
| ④ | 匹配逻辑 | `text ILIKE OR pinyin ILIKE OR pinyin_initial ILIKE`，全参数化 + 通配符转义 |
| ⑤ | 搜索范围 | v1 只搜 **moment 正文**（`moments.text`）；嵌套自评论（`comments.content`）**v1 不搜**，后续可加（moment_comments 表加拼音列成本翻倍，暂缓） |
| ⑥ | 存量数据 | 一次性回填脚本 `scripts/backfill-moment-pinyin.ts`（幂等，部署 runbook 执行） |
| ⑦ | 索引 | **不建索引**（单用户千级数据全表扫描毫秒级）；未来可加 pg_trgm GIN 作为可选优化 |
| ⑧ | 拼音列对外 | **不进 API 响应**（`MomentEntry` 不含 pinyin 字段，mappers 排除） |
| ⑨ | 多音字 | 接受 `pinyin-pro` 常用读音方案，不引入多读音存储（v1 局限，文档注明） |
| ⑩ | q 参数约束 | `z.string().trim().min(1).max(100).optional()`；与 page/pageSize/tag 正交组合 |
| ⑪ | 通配符 | `%` / `_` / `\` 作为字面量转义，防通配符注入 |
| ⑫ | Web UI | 列表页顶部搜索框：Input + Search 图标 + 清除按钮 + `useDebouncedValue(300)` + queryKey 加 keyword 段（自动重置第 1 页） |
| ⑬ | Flutter UI | 列表页 AppBar 下搜索栏：Riverpod provider + 300ms 防抖 + 复用 MomentCard |
| ⑭ | Web URL 状态 | v1 **不同步 keyword 到 URL**（无先例，保持简单；可后续增强） |
| ⑮ | CLI | `moment list --query` **本次实现**（`ListMomentsParams.Query`，json tag `q`） |
| ⑯ | MCP | 经 `.extend()` 自动获得 `q` 参数，无需改代码 |
| ⑰ | 测试 | 两层测试：`moment.domain.ts` 拼音生成纯函数单测（含多音字/英文混合/空串）+ `moment.service.test.ts` Zod schema（q 边界）+ 集成测试（真 PG 搜索三语言命中、分页、组合过滤、通配符转义） |

---

## 8. 实施要点（后续按此拆分）

1. **API**（api-agent）：
   - `bun add pinyin-pro`
   - `moment.schema.ts` 加 `pinyin` / `pinyin_initial` 列 → `bun run db:generate` 生成迁移
   - `moment.domain.ts` 加拼音生成纯函数（`toPinyinColumns(text)`）
   - `moment.types.ts` `ListMomentSchema` 加 `q`
   - `moment.service.ts` `list()` 加搜索分支（create/update 时写拼音列）
   - `moment.mappers.ts` 排除 pinyin 字段
   - `scripts/backfill-moment-pinyin.ts` 回填脚本
   - 单测 + 集成测试
2. **Web**（web-agent）：`moment-list-page` 搜索框 + `api.ts`/`queries.ts` 接线 + 空态
3. **Flutter**（flutter-agent）：搜索栏 + provider 接线 + 空态
4. **CLI**（cli-agent）：`moment list --query` + `ListMomentsParams.Query` + 单测
