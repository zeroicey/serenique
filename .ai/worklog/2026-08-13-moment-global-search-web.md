# 2026-08-13 — Moment 全局搜索 Web 端（列表页搜索框）

实现需求文档 `.ai/requirements/2026-08-13-moment-global-search.md` 第 5.1 节 + 决策 ⑫⑭：moment 列表页顶部新增搜索输入框，输入防抖 300ms 后经 `GET /api/moments?q=` 服务端过滤（text / pinyin / pinyin_initial 三列 ILIKE，后端由 api-agent 同批实施）。本次只做 apps/web，不动后端契约。

## 改动（apps/web，未提交）

- **`features/moment/api.ts`**：`ListMomentsParams` 增 `q?: string`；`listMoments` 改条件式 searchParams（对齐 `audit/api.ts` 先例）——`trim()` 后非空才拼入，空白关键词 = 全量列表。
- **`features/moment/queries.ts`**：`useMoments(pageSize, keyword)` 把 keyword 纳入 queryKey `['moments', keyword, pageSize]`——关键词变化 → 新 queryKey → `useInfiniteQuery` **自动从第 1 页重建 pages**（天然重置，无需手动 setPage）；`placeholderData: keepPreviousData` 防切换关键词时列表闪烁（对齐 audit-page 先例）；queryFn 只在 keyword 非空时传 `q`。现有 `invalidateQueries({ queryKey: ['moments'] })` 前缀失效逻辑依然兼容（新 key 前缀不变）。
- **`features/moment/components/moment-list.tsx`**：
  - 顶部搜索框（居中列 max-w-[600px] 内，与卡片列同宽，不放入顶栏 headerRight）：shadcn `Input` + lucide `Search` 图标（绝对定位 `left-2.5`）+ 有内容时清除按钮（X，`aria-label="清除搜索"`）+ 搜索中 `isFetching` 时右侧 spinner
  - 防抖：`useDebouncedValue(keyword, 300)`，`useMoments(PAGE_SIZE, debouncedKeyword.trim())`
  - 空态：搜索词非空且结果为空 → 「未找到匹配的闪记」（🔍 + 提示「换个关键词试试，支持中文、拼音或英文」）；原有「还没有闪记」空态保留
  - 搜索框在空态分支也渲染（否则无结果时无法清除关键词，用户会被困住）
  - IntersectionObserver 加 `!isFetching` 兜底（见坑 2）

## 验证

- `cd apps/web && bun run typecheck` ✅
- `bun run test`（vitest）231/231 ✅，其中新增：`api.test.ts`（q 拼参 3 例）、`queries.test.tsx`（keyword 变化带 q 从第 1 页重拉）、`moment-list.test.tsx`（渲染搜索框 / 防抖 q 请求 + 空态 / 清除恢复全量）
- `bun run build`（tsc + vite）✅
- `bunx eslint` 本次改动 6 文件 ✅ 无告警

## 坑 / 对下一次会话的提示

1. **`bun test` ≠ vitest**：apps/web 的 package.json `test` 脚本是 `vitest run`，但 `bun test` 会调 Bun 原生测试器——整个测试套件瞬间全挂（`vi.mocked is not a function`、`document is not defined`、`vi.stubGlobal is not a function` 满屏，且 25 个文件的错误一模一样）。AGENTS.md 工作流里写的 `bun test` 在 apps/web 是坑，**正确命令是 `bun run test`**。判断依据：看 package.json scripts 里 test 命令是什么。
2. **keepPreviousData + IntersectionObserver 组合需要 `!isFetching` 兜底**：关键词切换瞬间新 queryKey 无数据，`placeholderData` 会拿旧数据占位，旧数据的 `hasNextPage` 残留为 true；若哨兵恰好在可视区会误触发 `fetchNextPage`（对新关键词发出 page 2 请求）。在观察回调加 `!isFetching` 判断（关键词切换期间不发下一页），普通滚动加载不受影响。
3. **空态分支必须渲染搜索框**：搜索无结果时空态居中展示，若搜索框不渲染，用户无法点 X 清除关键词恢复全量列表——搜索框在 pending/error 外的所有分支都渲染。
4. **工作区有并行 agent 的未提交改动**（services/api 拼音列 + q 搜索、apps/cli `moment list --query`、bun.lock、requirements/README.md 状态行）：提交时只 stage apps/web 的 6 个文件，勿误提交他人工作。
5. 搜索框首次出现时机：`isPending`（首页全屏 spinner）期间不渲染搜索框，加载完成后才有——测试里要用 `findByPlaceholderText`/`findByText` 等待数据到达，不要同步 `getByPlaceholderText`。
