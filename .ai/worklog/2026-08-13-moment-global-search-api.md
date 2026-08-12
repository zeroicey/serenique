# 2026-08-13 — Moment 全局搜索 API 端（q 参数 + 拼音派生列）

实现需求文档 `.ai/requirements/2026-08-13-moment-global-search.md` 决策 ①-⑰ 的 API 部分：moments 表新增 `pinyin` / `pinyin_initial` 派生列，`GET /api/moments?q=` 三语言（中文/拼音全拼/拼音首字母/英文）搜索，与 page/pageSize/tag 正交组合。本次只做 `services/api`；CLI（`--query`）与 Web（搜索框）由并行 agent 同批实施。

## 改动（services/api，未提交）

- **`src/modules/moment/moment.schema.ts`**：moments 表加 `pinyin` / `pinyinInitial`（`text("pinyin")` / `text("pinyin_initial")`，可空）。`db/schema.ts` 已导出 moments 表，新列自动进中央注册表
- **`src/modules/moment/moment.domain.ts`**：新增 `toPinyinColumns(text)` 纯函数（pinyin-pro v3.28.2，`toneType:'none'` + `separator:''` + `nonZh:'consecutive'` + `v:true` + 空白归一化，四选项缺一不可）+ `toLikePattern(keyword)`（ILIKE 通配符 `%` `_` `\` 转义 + `%…%` 包裹）
- **`src/modules/moment/moment.types.ts`**：`ListMomentSchema` 加 `q: z.string().trim().min(1).max(100).optional()`（additive；`ListMomentInput` / MCP `.extend()` 自动获得）
- **`src/modules/moment/moment.service.ts`**：
  - `create` / `update` 写入时调 `toPinyinColumns(text)` 同步两列
  - `list()` 加 `q` 分支：`or(ilike(text, p), ilike(pinyin, p), ilike(pinyinInitial, p))`，pattern 为 `sql\`${toLikePattern(q)} escape '\\'\``；与 tag 的 `inArray` 用 `and()` 组合
- **`src/modules/moment/moment.mappers.ts`**：`toMomentEntry` 显式字段构造，pinyin 列天然不进 API 响应（加了守卫测试）
- **`src/test/helpers.ts`**：`fakeMomentRow` 补 `pinyin: null, pinyinInitial: null`（`$inferSelect` 新增可空属性后工厂必须补齐）
- **`src/modules/moment/moment.service.test.ts`**：单测 +7（拼音纯函数 6：中文/中英混合/多音字银行/ü→v/空串/ASCII 化；LIKE 转义 1；q 边界 1；mapper 排除 1）
- **`src/modules/moment/moment.service.integration.test.ts`**：集成测试 +10（中文命中/全拼命中/首字母命中/英文命中/混合子串 jing+eet/无结果/分页+total/与 tag 组合/`%` `_` 转义回归/update 同步拼音）
- **`drizzle/0015_add_moment_pinyin.sql`** + `meta/0015_snapshot.json` + `_journal.json` idx 15（`bunx drizzle-kit generate --name add_moment_pinyin`）
- **`scripts/backfill-moment-pinyin.ts`**：幂等回填（对齐 bootstrap-user.ts：只依赖 DATABASE_URL，不 import `@/env`；逐条计算，值一致则跳过 UPDATE）

## 验证

- `bun run typecheck` ✓；`bun test` 201 pass / 0 fail；`RUN_DB_TESTS=1` 全模块集成 110 pass / 0 fail（moment 22 个含新搜索场景）
- pinyin-pro 实测输出：`北京→beijing/bj`、`hello 中文→hello zhongwen/hello zw`、`银行→yinhang/yh`、`吕→lv`、空串→`''`

## 坑 & 提示（对下一次会话）

1. **`or()` 的返回类型是 `SQL<unknown> | undefined`**（drizzle 处理全 undefined 分支），`buildSearchCondition` 声明返回 `SQL | undefined`，`conditions` 数组用 `(SQL | undefined)[]`，`and(...conditions)` 天然过滤 undefined——`SQL[]` 会 TS2322。
2. **bun 自动加载 `.env`**：services/api/.env 的 `DATABASE_URL` 指向 `localhost:5433`（本地开发 PG），而 test compose DB 在 5432。跑集成测试必须显式 `DATABASE_URL=postgresql://serenique:serenique@127.0.0.1:5432/serenique RUN_DB_TESTS=1 bun test …`，否则 ECONNREFUSED 5433（`setTestEnv` 的 `??=` 会被 .env 抢占）。
3. **需求文档示例有误但配置正确**：文档写 `'hello 中文' → 'hz'`，实测 `nonZh:'consecutive'` + `pattern:'first'` 输出 `hello zw`（英文词完整保留、中文取首字母）。单测按实测断言，不按文档例子。
4. **集成测试分页用例的 marker 词泄漏**：我第一版分页测试用 `q:"北京"` 断言 `total===5`，但同文件前序测试也建了含「北京」的闪念 → 泄漏。改用本测试专属 marker 词（`专用分页词`）做 q，且 unrelated 行**不能含 marker**（我犯过：unrelated 也写了 marker 导致 page3 多 1 条）。
5. **ILIKE 转义在真实 PG 验证**：`sql\`${toLikePattern(q)} escape '\\'\`` 生成 `$n escape '\'`（PG standard_conforming_strings 默认 on，`'\'` = 单反斜杠）。转义回归测试（`100%` 不命中 `100通配`、`a_b` 不命中 `a!b`）证明行为正确——这些 sink 行的"反例"语义（若未转义会误命中）是测试的关键。
6. **`bunx drizzle-kit generate --name <slug>` 免 TTY**（worklog 08-08 已记，本次再确认）；`db:generate` 脚本本身在非 TTY 下交互提示失败，直接走 `--name` 形式。

## 状态

需求文档 `2026-08-13-moment-global-search.md` 头部状态仍是「🔶设计中」；API 部分实施完毕、CLI/Web 并行实施中、Flutter 未动——等 captain 收口全端后再由 remember-requirement 更新为 ✅已实施 并同步 `requirements/README.md`。
