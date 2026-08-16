# 习惯模块需求文档

- 日期：2026-08-16
- 状态：✅已实施（API+Web+CLI+AI 四端 + 生产/Cloudflare 部署 + iPhone 装机 2026-08-16）
- 范围：services/api、apps/web、apps/cli、AI 工具（services/api/src/modules/ai）
- 前置记录：无（全新模块）

---

## 1. 背景与目标

用户想记录「今天做了什么」。明确排除打卡/目标追踪机制：**不做连续天数、不做未完成提醒、不做目标压力**，本质是一本「我今天做了什么/没做什么」的流水账，纯文本、最简单形态起步。

核心场景：

- 打开页面 → 看到维护好的候选事项列表 → 做了哪件事就点一下 → 记录完成
- 没做也可以主动标记（区分「没做」与「忘了记」，回顾时不靠猜）
- 另一个页面看总览：哪天做了什么 + 每件事的简单频率统计
- 好事坏事都能记（视觉区分即可，不参与逻辑）
- 一个习惯一天可能做多次（如喝水）——计数型习惯记录次数

## 2. 数据模型

两张表（沿用全仓约定：日期存 text `YYYY-MM-DD`，同 task.due_date；id 为 uuid 默认随机）。

```text
habits        习惯选项    id uuid PK, name text NOT NULL, kind text NOT NULL CHECK('good'|'bad'),
                         countable boolean NOT NULL default false,
                         sort_order int NOT NULL default 0,
                         created_at / updated_at (withTimezone, defaultNow)

habit_daily   每日状态    id uuid PK, habit_id uuid NOT NULL FK→habits ON DELETE CASCADE,
                         date text NOT NULL ('YYYY-MM-DD'),
                         status text CHECK('done'|'not_done') NULL,   ← 做没做型用
                         count int NOT NULL default 0,                ← 计数型用
                         created_at / updated_at
                         UNIQUE(habit_id, date)
```

- **两种习惯类型**（`habits.countable` 区分，创建时用户选择）：
  - 做没做型（countable=false，默认）：跑步/读书/熬夜 → 三态 `未记录` / `done` / `not_done`，写 status
  - 计数型（countable=true）：喝水/吃药 → 一天一个 count 值（≥0），count=0 即没做，不写 status
- 同一习惯一天最多一条记录（UNIQUE 约束），计数型不搞流水明细，只记次数
- 服务层按 countable 校验写入：计数型写 count（status 忽略/禁用），做没做型写 status（count 恒 0）

## 3. 业务规则

| 规则 | 说明 |
| ------ | ------ |
| name | trim 后 1~100 字符 |
| kind | 仅 'good' / 'bad'，只做视觉区分（绿/红），不参与任何逻辑 |
| description | 可选，≤500 字符，trim；空串归一化为 null（习惯简介） |
| count | 整数 ≥0；计数型设置时校验，做没做型恒 0 |
| status | 仅 'done' / 'not_done'；null = 未记录 |
| date | 有效日历日期（往返校验，同 task DueDateSchema） |
| sortOrder | 整数，默认 0；列表按 sortOrder asc, createdAt asc 稳定排序 |
| 删除习惯 | 级联删除其全部每日状态 |
| 切换 countable | 只校验当前写入，不回填/不清历史（保持简单） |
| 总览 days | 默认 30，上限 365 |
| 统一响应 | 所有响应 `{ success, code, message, data?, error? }`（Res builder）；业务错误抛 AppError |
| 契约锚定 | 跨端字段以 services/api 源码为准，exports.ts 导出面同步 |

## 4. API 路由

| 方法 | 路径 | 说明 |
| ------ | ------ | ------ |
| GET | `/api/habits` | 习惯选项列表（sortOrder asc, createdAt asc） |
| POST | `/api/habits` | 创建 `{ name, kind, countable?, description? }` |
| PUT | `/api/habits/:id` | 更新 `{ name?, kind?, countable?, sortOrder?, description? }`（至少一个字段） |
| DELETE | `/api/habits/:id` | 删除（级联每日状态） |
| GET | `/api/habit-daily?date=YYYY-MM-DD` | 当天全部状态 `[{ habitId, status, count }]` |
| PUT | `/api/habits/:habitId/daily/:date` | upsert 每日状态 `{ status? \| count? }` |
| DELETE | `/api/habits/:habitId/daily/:date` | 清掉当天该习惯的记录（回未记录） |
| GET | `/api/habit-daily/overview?days=N` | 总览：`{ days, byDate: {date: [记录+习惯名/kind]}, stats: [{ habitId, name, kind, countable, doneDays, notDoneDays, totalCount }] }` |

## 5. 各端范围

| 端 | 交付 |
| ---- | ------ |
| **API** | habit 模块全套（schema/types/domain/mappers/service/handler/router/index）+ 单测/集成测试；db/schema.ts 注册；app.ts 挂载；exports.ts 导出 |
| **Web** | `/habit` 今天页：日期导航（复用 event-date-nav 模式）+ 习惯行（✓做了/✗没做 或 +1 计数 + 备注输入）+ 习惯选项管理（增删改排序）；`/habit/overview` 总览页：按天流水（绿✓红✗/×N）+ 每习惯频率统计 |
| **CLI** | `serenique habit`：list / create / update / delete / today / do / not / count / overview（cobra，仿 task 模块） |
| **AI** | ai.tools.ts 加工具：list_habits、create_habit、update_habit、delete_habit、set_habit_daily、get_habit_overview（自然语言记录/查询/管理习惯） |

## 6. 已定决策

| # | 决策点 | 结论 |
| --- | -------- | ------ |
| 1 | 记录粒度 | 一天一状态（UNIQUE habit_id+date），计数型用 count 表达次数，不做流水明细 |
| 2 | 交互模型 | 三态：未记录 / done / not_done；计数型 count=0 即没做 |
| 3 | 多习惯类型 | countable 双模式：做没做型 + 计数型，创建时选择 |
| 4 | 没做标记 | 需要（区分「没做」与「漏记」），仅做没做型 |
| 5 | 备注 | 习惯简介 description 字段（可选 ≤500），每日记录无备注（D-007） |
| 6 | 总览 | 按天流水 + 频率统计（doneDays / totalCount）都要 |
| 7 | 习惯选项管理 | 完整 CRUD + sortOrder 排序 |
| 8 | 目标感 | 不做连续天数/提醒/进度条，无压力记录 |
| 9 | AI 范围 | 含习惯选项管理（完整 CRUD 工具） |
| 10 | CLI | 需要，全量子命令 |
