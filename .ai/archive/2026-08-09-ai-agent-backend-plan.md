# AI 助手模块（宁序）后端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `services/api` 内新增 `ai` 模块：内嵌 PI SDK（`@earendil-works/pi-coding-agent` 0.84.x）承担 agent 循环，通过 `defineTool` 自定义工具直接调用现有 service 层（task/event/moment），暴露 `/api/ai/ws` WebSocket 供前端流式对话，会话由 PI `SessionManager` 持久化到独立卷 `/data/sessions`。

**Architecture:** 需求文档 `.ai/requirements/2026-08-09-ai-agent-module.md`（评审修正版）。关键点：同会话进程内单实例注册表；`excludeTools` 排除 7 个内置工具（**禁用 `tools: []`**）；`systemPromptOverride` 返回真实提示词；WS Origin 白名单防 CSWSH；`index.ts` 挂载 `hono/bun` 的 `createBunWebSocket`；`exports.ts` 不导出 aiService。

**Tech Stack:** Bun / Hono 4.13 / TypeScript strict / Zod / `@earendil-works/pi-coding-agent` + `pi-agent-core` + `pi-ai` / `typebox@1.3.7` / Pino。测试：bun:test；集成测试用 pi-ai 的 **faux provider**（本地假模型，可预置 toolCall 响应，不发真实 API）。

## Global Constraints

- 工作目录：`services/api/`；路径别名 `@/*` → `src/*`。
- 依赖版本：`@earendil-works/pi-coding-agent@^0.84.1`、`typebox@1.3.7`（**必须与 pi-agent-core 传递依赖版本一致**，pi 的类型 `Static/TSchema` 依赖它）。
- 内置工具排除写法：`excludeTools: ["bash","read","edit","write","grep","find","ls"]`（**不能写 `tools: []`**——空 Set 会把 customTools 业务工具一起过滤掉）。
- 系统提示词：`systemPromptOverride` **必须返回真实字符串**（返回 undefined 会回退默认编程助手提示词）。
- 模型默认 `deepseek/deepseek-v4-flash`（凭据 `DEEPSEEK_API_KEY`）；**不要用原型的 `opencode-go/...`**（凭据错配）。
- 全局隔离：`SettingsManager.inMemory()` + `noExtensions/noSkills/noPromptTemplates/noThemes/noContextFiles` + `agentDir` 指向项目内目录。
- WS 协议/历史渲染模型/会话列表：与原型 `~/workspace/tests/pi-test/server.ts` 一致（可对照）。
- 用户可见错误消息用中文。
- 验证命令：`bun run typecheck`、`bun test`（api 目录内）、`bun run test:integration:full`（DB 集成）。
- 提交信息用英文 conventional-commit。

---

### Task 1: 依赖与 env 扩展

**Files:**
- Modify: `services/api/package.json`
- Modify: `services/api/src/env.ts`
- Modify: `services/api/.gitignore`（若存在；否则根 `.gitignore`）

**Interfaces:**
- Produces: `env.AI_SESSION_DIR: string`（必填，由默认值兜底）、`env.AI_MODEL: string | undefined`。

- [ ] **Step 1: 安装依赖**

```bash
cd services/api && bun add @earendil-works/pi-coding-agent@^0.84.1 typebox@1.3.7
```

验证：`grep typebox services/api/package.json` 输出 `"typebox": "1.3.7"`。

- [ ] **Step 2: env.ts 新增 AI 配置**

`services/api/src/env.ts` 的 `envSchema` 中，`NODE_ENV` 之后追加：

```ts
  // ---- AI 助手（宁序，见 .ai/requirements/2026-08-09-ai-agent-module.md）----
  // 会话 jsonl 目录。生产缺省 /data/sessions（容器卷）；dev/test 用项目内目录，
  // 避免 Mac 上 /data 不存在。模型凭据（DEEPSEEK_API_KEY）由 pi-ai 直接读
  // process.env，不进本 schema。
  AI_SESSION_DIR: z.string().optional(),
  // 模型选择 "provider/modelId"，缺省 deepseek/deepseek-v4-flash。
  AI_MODEL: z.string().optional(),
```

并在 `export const env` 处解析后补默认值（文件末尾追加）：

```ts
export const aiSessionDir =
  env.AI_SESSION_DIR ??
  (env.NODE_ENV === "production" ? "/data/sessions" : "./.data/sessions");
export const aiModel = env.AI_MODEL ?? "deepseek/deepseek-v4-flash";
```

- [ ] **Step 3: gitignore 会话目录**

`services/api/.gitignore`（不存在则创建）追加：

```
.data/
```

- [ ] **Step 4: 验证**

```bash
cd services/api && bun run typecheck
```

Expected: 通过（无 AI 相关类型错误）。

- [ ] **Step 5: Commit**

```bash
git add services/api/package.json services/api/bun.lock services/api/src/env.ts services/api/.gitignore
git commit -m "feat: add ai module deps and env config"
```

---

### Task 2: 业务工具 `ai.tools.ts`

**Files:**
- Create: `services/api/src/modules/ai/ai.tools.ts`
- Create: `services/api/src/modules/ai/ai.tools.test.ts`

**Interfaces:**
- Produces: `buildAiTools(): ToolDefinition[]` — 11 个工具（task 7 + event 5 + moment 3，见下表）；`formatEntry(value: unknown): string`（JSON 序列化辅助）。

工具清单（`name` → 参数（TypeBox）→ service 调用）：

| name | 参数 | 调用 |
|------|------|------|
| `list_task_groups` | `{}` | `taskService.listTaskGroups({ page: 1, pageSize: 50 })` |
| `create_task_group` | `{ title }` | `taskService.createTaskGroup({ title })` |
| `list_tasks` | `{ groupId?, status?, dueDateFrom?, dueDateTo? }` | `taskService.listTasks({ page: 1, pageSize: 50, ... })` |
| `get_task` | `{ id }` | `taskService.getTask({ id })` |
| `create_task` | `{ title, groupId?, status?, dueDate? }` | groupId 省略 → 首个组（无组则自动建「默认」组），再 `taskService.createTask` |
| `update_task` | `{ id, title?, groupId?, status?, dueDate? }` | `taskService.updateTask` |
| `delete_task` | `{ id }` | `taskService.deleteTask` |
| `list_events` | `{ from, to }`（ISO） | `eventService.list({ from, to })` |
| `get_event` | `{ id }` | `eventService.get({ id })` |
| `create_event` | `{ title, startAt, endAt, isAllDay?, location?, note? }` | `eventService.create` |
| `update_event` | `{ id, title?, startAt?, endAt?, isAllDay?, location?, note? }` | `eventService.update` |
| `delete_event` | `{ id }` | `eventService.delete` |
| `list_moments` | `{}` | `momentService.list({ page: 1, pageSize: 20 })` |
| `get_moment` | `{ id }` | `momentService.get({ id })` |
| `create_moment` | `{ text }` | `momentService.create({ text })` |

- [ ] **Step 1: 写失败测试**

`ai.tools.test.ts`：

```ts
import { describe, expect, test } from "bun:test";
import { buildAiTools } from "./ai.tools";

describe("ai.tools", () => {
  test("注册 15 个工具且名称唯一", () => {
    const tools = buildAiTools();
    const names = tools.map((t) => t.name);
    expect(names.length).toBe(15);
    expect(new Set(names).size).toBe(15);
  });

  test("create_task 参数 schema 接受最小输入", async () => {
    const tools = buildAiTools();
    const tool = tools.find((t) => t.name === "create_task")!;
    // 通过 execute 校验 schema 是否放行（groupId 省略）
    const result = await tool.execute("c1", { title: "写周报" }, undefined, undefined, {} as any);
    expect(result.isError).toBe(true); // 无 DB 时服务抛错 → 映射为 isError，而不是 schema 拒绝
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd services/api && bun test src/modules/ai/ai.tools.test.ts
```

Expected: FAIL（`./ai.tools` 不存在）。

- [ ] **Step 3: 实现 ai.tools.ts**

```ts
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { taskService } from "@/modules/task/task.service";
import { eventService } from "@/modules/event/event.service";
import { momentService } from "@/modules/moment/moment.service";

// AgentToolResult 统一构建：成功 → JSON 文本；AppError/未知错误 → isError。
export function formatEntry(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function run(
  fn: () => Promise<unknown>,
): Promise<{ content: { type: "text"; text: string }[]; details: {}; isError?: boolean }> {
  try {
    return { content: [{ type: "text", text: formatEntry(await fn()) }], details: {} };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `操作失败: ${message}` }],
      details: {},
      isError: true,
    };
  }
}

/** groupId 省略时落到首个任务组；没有组则自动创建「默认」组。 */
async function resolveGroupId(groupId?: string): Promise<string> {
  if (groupId) return groupId;
  const groups = await taskService.listTaskGroups({ page: 1, pageSize: 50 });
  if (groups.items.length > 0) return groups.items[0].id;
  return (await taskService.createTaskGroup({ title: "默认" })).id;
}

export function buildAiTools(): ToolDefinition[] {
  return [
    defineTool({
      name: "list_task_groups",
      label: "List Task Groups",
      description: "列出全部任务分组",
      parameters: Type.Object({}),
      execute: (_id, _p, _s, _u, _c) => run(() => taskService.listTaskGroups({ page: 1, pageSize: 50 })),
    }),
    defineTool({
      name: "create_task_group",
      label: "Create Task Group",
      description: "创建任务分组",
      parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 200 }) }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.createTaskGroup(p)),
    }),
    defineTool({
      name: "list_tasks",
      label: "List Tasks",
      description: "按可选条件列出任务（status: todo|done|abandon；dueDate 格式 YYYY-MM-DD）",
      parameters: Type.Object({
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDateFrom: Type.Optional(Type.String()),
        dueDateTo: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) =>
        run(() =>
          taskService.listTasks({ page: 1, pageSize: 50, ...(p as object) }),
        ),
    }),
    defineTool({
      name: "get_task",
      label: "Get Task",
      description: "按 id 获取任务详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.getTask(p)),
    }),
    defineTool({
      name: "create_task",
      label: "Create Task",
      description:
        "创建任务。groupId 可省略（自动落到首个分组或「默认」分组）；status: todo|done|abandon；dueDate 格式 YYYY-MM-DD",
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDate: Type.Optional(Type.String()),
      }),
      execute: async (_id, p, _s, _u, _c) => {
        const groupId = await resolveGroupId((p as { groupId?: string }).groupId);
        return run(() =>
          taskService.createTask({ ...(p as object), groupId } as never),
        );
      },
    }),
    defineTool({
      name: "update_task",
      label: "Update Task",
      description: "更新任务（title/groupId/status/dueDate，传哪些改哪些）",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDate: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.updateTask(p as never)),
    }),
    defineTool({
      name: "delete_task",
      label: "Delete Task",
      description: "按 id 删除任务",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.deleteTask(p)),
    }),
    defineTool({
      name: "list_events",
      label: "List Events",
      description: "按时间窗列出事件（from/to 为带时区偏移的 ISO 8601 时间）",
      parameters: Type.Object({
        from: Type.String(),
        to: Type.String(),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.list(p as never)),
    }),
    defineTool({
      name: "get_event",
      label: "Get Event",
      description: "按 id 获取事件详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.get(p)),
    }),
    defineTool({
      name: "create_event",
      label: "Create Event",
      description: "创建事件。startAt/endAt 为带时区偏移的 ISO 8601（如 2026-08-09T10:00:00+08:00）",
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        startAt: Type.String(),
        endAt: Type.String(),
        isAllDay: Type.Optional(Type.Boolean()),
        location: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.create(p as never)),
    }),
    defineTool({
      name: "update_event",
      label: "Update Event",
      description: "更新事件（传哪些改哪些）",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        startAt: Type.Optional(Type.String()),
        endAt: Type.Optional(Type.String()),
        isAllDay: Type.Optional(Type.Boolean()),
        location: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.update(p as never)),
    }),
    defineTool({
      name: "delete_event",
      label: "Delete Event",
      description: "按 id 删除事件",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.delete(p)),
    }),
    defineTool({
      name: "list_moments",
      label: "List Moments",
      description: "列出最新闪念（前 20 条）",
      parameters: Type.Object({}),
      execute: (_id, _p, _s, _u, _c) =>
        run(() => momentService.list({ page: 1, pageSize: 20 })),
    }),
    defineTool({
      name: "get_moment",
      label: "Get Moment",
      description: "按 id 获取闪念详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => momentService.get(p)),
    }),
    defineTool({
      name: "create_moment",
      label: "Create Moment",
      description: "创建闪念（纯文本）",
      parameters: Type.Object({ text: Type.String({ maxLength: 10000 }) }),
      execute: (_id, p, _s, _u, _c) => run(() => momentService.create(p as never)),
    }),
  ];
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd services/api && bun test src/modules/ai/ai.tools.test.ts
```

Expected: PASS（2 tests；`create_task` execute 无 DB 时报 isError，验证错误映射路径）。

- [ ] **Step 5: 验证依赖接口存在**

```bash
grep -n "listTaskGroups\|listTasks\|createTask\b\|updateTask\b\|deleteTask\b" src/modules/task/task.service.ts | head
grep -n "async list\|async create\|async get\|async update\|async delete" src/modules/event/event.service.ts src/modules/moment/moment.service.ts | head
```

确认 `taskService.listTaskGroups` 返回 `{ items, total }` 形状；`momentService.list` 签名与 `{ page, pageSize }` 输入匹配。若实际签名与上面代码不符，以源码为准调整调用。

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/ai/
git commit -m "feat: add ai business tools (task/event/moment)"
```

---

### Task 3: 系统提示词 `ai.system-prompt.ts`

**Files:**
- Create: `services/api/src/modules/ai/ai.system-prompt.ts`
- Create: `services/api/src/modules/ai/ai.system-prompt.test.ts`

**Interfaces:**
- Produces: `buildSystemPrompt(now: Date): string`（纯函数，无 import 副作用）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "./ai.system-prompt";

describe("ai.system-prompt", () => {
  const now = new Date("2026-08-09T10:00:00+08:00");
  const prompt = buildSystemPrompt(now);

  test("包含当前日期与星期", () => {
    expect(prompt).toContain("2026-08-09");
    expect(prompt).toContain("星期日");
  });

  test("说明工具使用方式", () => {
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("create_event");
  });

  test("要求中文回复", () => {
    expect(prompt).toContain("中文");
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd services/api && bun test src/modules/ai/ai.system-prompt.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// 系统提示词 — 纯函数。注意：返回 undefined 会回退到 PI 默认编程助手提示词，
// 所以必须总是返回字符串。自定义提示词下 SDK 不再注入 "Available tools" 段，
// 工具用法需在此说明（工具 schema 本身仍由 LLM function-calling 传入）。
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function buildSystemPrompt(now: Date): string {
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const weekday = WEEKDAYS[now.getDay()];

  return `你是「宁序」，Serenique 的个人生活助手。你帮用户管理任务、日程（事件）和闪念。

当前日期：${dateStr}（星期${weekday}）。日期以今天为准，"今天/明天/本周"按此推算。

## 你可以使用的工具

- 任务分组：list_task_groups、create_task_group
- 任务：list_tasks、get_task、create_task、update_task、delete_task
  - create_task 的 groupId 可省略；status 取 todo / done / abandon；dueDate 格式 YYYY-MM-DD
- 事件（日历）：list_events、get_event、create_event、update_event、delete_event
  - 时间参数用带时区偏移的 ISO 8601（如 2026-08-09T10:00:00+08:00）
- 闪念：list_moments、get_moment、create_moment

## 行为准则

1. 用户用自然语言提需求时，直接调用相应工具完成，不要只给建议不执行。
2. 缺少数值（如日期、时间）时先询问，不要编造；相对时间（今天、下午 3 点）按当前日期推算。
3. 工具返回失败时向用户说明失败原因。
4. 操作完成用一句中文确认结果（创建了什么/改了什么）。
5. 用户闲聊时正常对话，不调用工具。
6. 每次只做用户要求的事，不做多余操作。
7. 回复一律用简体中文。`;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd services/api && bun test src/modules/ai/ai.system-prompt.test.ts
```

Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/ai/
git commit -m "feat: add ai system prompt"
```

---

### Task 4: 会话服务 `ai.service.ts`

**Files:**
- Create: `services/api/src/modules/ai/ai.service.ts`
- Create: `services/api/src/modules/ai/ai.service.test.ts`

**Interfaces:**
- Produces（供 Task 5 使用，精确签名）：
  - `aiService.isAiEnabled(): boolean` — 返回 `typeof ModelRuntime` 初始化是否成功（无凭据时 false，按连接报错）。
  - `aiService.createAgentSessionFor(sm: SessionManager): Promise<AgentSession>` — 隔离 loader + 模型 + customTools + `excludeTools` + `systemPromptOverride`。
  - `aiService.getOrCreateSession(sessionId: string, sm: SessionManager): Promise<AgentSession>` — **同会话单实例注册表**。
  - `aiService.releaseSession(sessionId: string): void` — dispose + 移除注册表。
  - `aiService.listSessions(): Promise<SessionInfo[]>`（按修改时间倒序）。
  - `aiService.openRecentOrCreate(): Promise<{ sm: SessionManager; session: AgentSession }>`。
  - `aiService.openSession(path: string): Promise<{ sm: SessionManager; session: AgentSession }>`。
  - `aiService.createNewSession(): Promise<{ sm: SessionManager; session: AgentSession }>`。
  - `aiService.deleteSession(sessionId: string): Promise<void>` — unlink 文件 + 释放注册表实例。
  - `aiService.findSessionPath(sessionId): Promise<string | undefined>`。
  - `forwardEvents(target: (json: string) => void, session: AgentSession): () => void` — 事件→WS JSON 转发（含 `safeSend` 语义，close 后调用方自兜底）。
  - `toRenderMessages(messages: AgentMessage[]): RenderMessage[]` — 历史渲染模型（纯函数，导出便于单测）。
  - `type RenderMessage = { role: "user"|"assistant"; text: string; thinking: string; toolCalls: RenderToolCall[] }`、`type RenderToolCall = { id: string; name: string; args: unknown; result: string; isError: boolean }`。

- [ ] **Step 1: 写失败测试（纯函数 + 隔离初始化）**

```ts
import { describe, expect, test } from "bun:test";
import { toRenderMessages } from "./ai.service";

describe("ai.service", () => {
  test("toRenderMessages 关联 toolResult 到 toolCall", () => {
    const messages = [
      { role: "user", content: "创建一个任务" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "用户要建任务" },
          { type: "text", text: "好的" },
          { type: "toolCall", id: "t1", name: "create_task", arguments: { title: "写周报" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "t1",
        content: [{ type: "text", text: '{"id":"1"}' }],
        isError: false,
      },
    ] as any;

    const out = toRenderMessages(messages);
    expect(out).toHaveLength(2);
    expect(out[1].thinking).toBe("用户要建任务");
    expect(out[1].text).toBe("好的");
    expect(out[1].toolCalls[0].result).toBe('{"id":"1"}');
    expect(out[1].toolCalls[0].isError).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd services/api && bun test src/modules/ai/ai.service.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 ai.service.ts**

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { unlink } from "node:fs/promises";
import { aiModel, aiSessionDir } from "@/env";
import { buildAiTools } from "./ai.tools";
import { buildSystemPrompt } from "./ai.system-prompt";

// ---------------------------------------------------------------------------
// AI 会话服务 — 进程内单例。
// 职责：模型/凭据运行时、隔离资源加载器、同会话单实例注册表、会话 CRUD、
// 事件转发、历史渲染模型。不接触 Hono（由 handler 层负责 WS 收发）。
// ---------------------------------------------------------------------------

let sharedModelRuntime: ModelRuntime | undefined;
let sharedLoader: DefaultResourceLoader | undefined;
let runtimeError: Error | undefined;

async function getRuntime(): Promise<ModelRuntime> {
  if (runtimeError) throw runtimeError;
  if (!sharedModelRuntime) {
    try {
      sharedModelRuntime = await ModelRuntime.create();
    } catch (err) {
      runtimeError = err instanceof Error ? err : new Error(String(err));
      throw runtimeError;
    }
  }
  return sharedModelRuntime;
}

async function getLoader(): Promise<DefaultResourceLoader> {
  if (!sharedLoader) {
    const settingsManager = SettingsManager.inMemory();
    sharedLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(), // 指向项目自身，防止 ~/.pi/agent 资源发现
      settingsManager,
      noExtensions: true, // 关键：不加载扩展 → pi-mcp-adapter 不会启动
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => buildSystemPrompt(new Date()),
      appendSystemPromptOverride: () => [],
    });
    await sharedLoader.reload();
  }
  return sharedLoader;
}

async function resolveModel() {
  const modelRuntime = await getRuntime();
  const [provider, modelId] = aiModel.split("/");
  return (
    modelRuntime.getModel(provider, modelId) ??
    (await modelRuntime.getAvailable())[0]
  );
}

/** 全部业务工具 + 排除 7 个内置工具。注意不能用 tools: []（会把业务工具过滤掉）。 */
const EXCLUDED_BUILTIN_TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"];

// ---- 同会话单实例注册表 -----------------------------------------------
// SessionManager 无文件锁：同一会话两个 AgentSession 实例会互相覆盖
// jsonl（assistant 首条时整文件重写）。注册表保证同会话进程内只有一个实例。
const sessionRegistry = new Map<string, AgentSession>();

export function createAgentSessionFor(
  sm: SessionManager,
): Promise<AgentSession> {
  return createAgentSession({
    resourceLoader: await_loader(),
    settingsManager: SettingsManager.inMemory(),
    sessionManager: sm,
    model: await_resolveModel(),
    modelRuntime: await_runtime(),
    customTools: buildAiTools(),
    excludedToolNames: EXCLUDED_BUILTIN_TOOLS,
    thinkingLevel: "high",
  }).then((r) => r.session);
}

async function await_loader() { return getLoader(); }
async function await_runtime() { return getRuntime(); }
async function await_resolveModel() { return resolveModel(); }

/** 会话目录下所有 session 文件（pi 文件格式 `<ts>_<uuid>.jsonl`）。 */
const SESSION_DIR = aiSessionDir;

export async function listSessions(): Promise<Array<{
  id: string;
  name: string;
  messageCount: number;
  modified: string;
}>> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR);
  return infos
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .map((info) => ({
      id: info.id,
      name: info.name ?? (info.firstMessage ? info.firstMessage.slice(0, 30) : "新会话"),
      messageCount: info.messageCount,
      modified: info.modified.toISOString(),
    }));
}

export async function findSessionPath(id: string): Promise<string | undefined> {
  const infos = await SessionManager.list(process.cwd(), SESSION_DIR);
  return infos.find((info) => info.id === id)?.path;
}

export async function openRecentOrCreate() {
  const sm = SessionManager.continueRecent(process.cwd(), SESSION_DIR);
  return { sm, session: await getOrCreateSession(sm) };
}

export async function openSession(path: string) {
  const sm = SessionManager.open(path, SESSION_DIR, process.cwd());
  return { sm, session: await getOrCreateSession(sm) };
}

export async function createNewSession() {
  const sm = SessionManager.create(process.cwd(), SESSION_DIR);
  return { sm, session: await getOrCreateSession(sm) };
}

async function getOrCreateSession(sm: SessionManager): Promise<AgentSession> {
  const id = sm.getSessionId();
  const existing = sessionRegistry.get(id);
  if (existing) return existing;
  const session = await createAgentSessionFor(sm);
  sessionRegistry.set(id, session);
  return session;
}

export function releaseSession(id: string): void {
  const session = sessionRegistry.get(id);
  if (session) {
    session.dispose();
    sessionRegistry.delete(id);
  }
}

export async function deleteSession(id: string): Promise<void> {
  const path = await findSessionPath(id);
  if (!path) throw new Error(`会话不存在: ${id}`);
  releaseSession(id);
  await unlink(path);
}

// ---- 事件转发 ----------------------------------------------------------
// target: 收 JSON 字符串（WS 发送）。转发事件与 pi-test/server.ts 对齐。
export function forwardEvents(
  target: (json: string) => void,
  session: AgentSession,
): () => void {
  return session.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const a = event.assistantMessageEvent;
        if (a.type === "text_delta" || a.type === "thinking_delta") {
          target(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: a.type, delta: a.delta } }));
        }
        break;
      }
      case "tool_execution_start":
        target(JSON.stringify({ type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args }));
        break;
      case "tool_execution_update":
        target(JSON.stringify({ type: "tool_execution_update", toolCallId: event.toolCallId, toolName: event.toolName, partialResult: summarize(event.partialResult, 500) }));
        break;
      case "tool_execution_end":
        target(JSON.stringify({ type: "tool_execution_end", toolCallId: event.toolCallId, toolName: event.toolName, result: summarize(event.result), isError: event.isError }));
        break;
      case "agent_start":
      case "agent_settled":
      case "turn_start":
      case "turn_end":
      case "agent_end":
        target(JSON.stringify({ type: event.type }));
        break;
    }
  });
}

function summarize(value: unknown, max = 2000): string {
  if (value === null || value === undefined) return String(value);
  const content = (value as any)?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c?.type === "text" ? c.text : c?.type === "image" ? "[image]" : JSON.stringify(c)))
      .join("\n");
    return text.length > max ? text.slice(0, max) + "…(截断)" : text;
  }
  if (typeof value === "string") return value.length > max ? value.slice(0, max) + "…(截断)" : value;
  try {
    const s = JSON.stringify(value);
    return s.length > max ? s.slice(0, max) + "…(截断)" : s;
  } catch {
    return String(value).slice(0, max);
  }
}

// ---- 历史渲染模型 ------------------------------------------------------
export type RenderToolCall = {
  id: string;
  name: string;
  args: unknown;
  result: string;
  isError: boolean;
};
export type RenderMessage = {
  role: "user" | "assistant";
  text: string;
  thinking: string;
  toolCalls: RenderToolCall[];
};

export function toRenderMessages(messages: AgentMessage[]): RenderMessage[] {
  const results = new Map<string, { result: string; isError: boolean }>();
  for (const m of messages) {
    if (m.role === "toolResult") {
      results.set(m.toolCallId, { result: summarize(m.content), isError: m.isError });
    }
  }
  const out: RenderMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", text: userText(m.content as any), thinking: "", toolCalls: [] });
    } else if (m.role === "assistant") {
      let text = "";
      let thinking = "";
      const toolCalls: RenderToolCall[] = [];
      for (const c of m.content as any[]) {
        if (c.type === "text") text += c.text;
        else if (c.type === "thinking") thinking += c.thinking;
        else if (c.type === "toolCall") {
          const tr = results.get(c.id);
          toolCalls.push({
            id: c.id,
            name: c.name,
            args: c.arguments,
            result: tr?.result ?? "",
            isError: tr?.isError ?? false,
          });
        }
      }
      out.push({ role: "assistant", text, thinking, toolCalls });
    }
  }
  return out;
}

function userText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((c) => c.text ?? "[image]").join("\n");
}

export const aiService = {
  isAiEnabled: async (): Promise<boolean> => {
    try {
      await getRuntime();
      return true;
    } catch {
      return false;
    }
  },
  listSessions,
  findSessionPath,
  openRecentOrCreate,
  openSession,
  createNewSession,
  getOrCreateSession,
  releaseSession,
  deleteSession,
  forwardEvents,
};
```

> 注：上面 `createAgentSessionFor` 用了临时辅助 `await_*` 包装（顶层 await 不可用在函数内）。若 `createAgentSession` 的 options 需要顶层 await 的 loader/model/runtime，把辅助函数改为在 `createAgentSessionFor` 内顺序 await 的写法（`const loader = await getLoader(); const rt = await getRuntime(); const model = await resolveModel();`）并删除 `await_*`。

- [ ] **Step 4: 运行确认通过**

```bash
cd services/api && bun test src/modules/ai/ai.service.test.ts && bun run typecheck
```

Expected: PASS + typecheck 通过。若 typebox/`excludedToolNames` 字段名与 SDK 0.84.1 类型不一致（对照 `node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts` 与原型 server.ts 的实际 options），以实际 SDK 为准调整（原型用的是 `createAgentSession({ resourceLoader, settingsManager, sessionManager, model, modelRuntime, thinkingLevel })`，`excludedToolNames` 的准确字段名须从 sdk.d.ts 确认；若该版本 SDK 只有 `excludeTools`，则改用之）。

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/ai/ai.service.ts services/api/src/modules/ai/ai.service.test.ts
git commit -m "feat: add ai session service with registry"
```

---

### Task 5: WS 协议层（types/handler/router + 接线）

**Files:**
- Create: `services/api/src/modules/ai/ai.types.ts`
- Create: `services/api/src/modules/ai/ai.handler.ts`
- Create: `services/api/src/modules/ai/ai.handler.test.ts`
- Create: `services/api/src/modules/ai/ai.router.ts`
- Create: `services/api/src/modules/ai/index.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/src/index.ts`

**Interfaces:**
- Produces: `aiRouter: Hono`（挂在 `/api/ai/ws`）；`isAllowedOrigin(origin: string | undefined, allowed: string[]): boolean`（纯函数，单测）。
- Consumes: Task 4 的 `aiService` 全部方法。

- [ ] **Step 1: 写失败测试（Origin 校验）**

`ai.handler.test.ts`：

```ts
import { describe, expect, test } from "bun:test";
import { isAllowedOrigin } from "./ai.handler";

describe("ai.handler", () => {
  const allowed = [
    "https://serenique.pages.dev",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  test("白名单内放行", () => {
    expect(isAllowedOrigin("https://serenique.pages.dev", allowed)).toBe(true);
  });

  test("同源（无 Origin 头）放行（本地/dev 工具场景）", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
  });

  test("白名单外拒绝", () => {
    expect(isAllowedOrigin("https://evil.example.com", allowed)).toBe(false);
  });

  test("忽略端口差异拒绝（严格相等）", () => {
    expect(isAllowedOrigin("https://serenique.pages.dev:8443", allowed)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd services/api && bun test src/modules/ai/ai.handler.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 ai.types.ts（协议类型）**

```ts
// WS 协议消息类型（客户端 → 服务端 / 服务端 → 客户端）。
// 与原型 ~/workspace/tests/pi-test/server.ts 对齐。

export type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "abort" }
  | { type: "list_sessions" }
  | { type: "new_session" }
  | { type: "switch_session"; sessionId: string }
  | { type: "delete_session"; sessionId: string };

export type ServerMessage =
  | { type: "sessions"; sessions: Array<{ id: string; name: string; messageCount: number; modified: string }> }
  | { type: "session_ready"; sessionId: string; model: string; messages: unknown[] }
  | { type: "session_switched"; sessionId: string; model: string; messages: unknown[] }
  | { type: "session_deleted"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "agent_start" }
  | { type: "agent_settled" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "agent_end" }
  | { type: "message_update"; assistantMessageEvent: { type: "text_delta" | "thinking_delta"; delta: string } }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      partialResult: string;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: string;
      isError: boolean;
    };
```

- [ ] **Step 4: 实现 ai.handler.ts + ai.router.ts**

`ai.handler.ts`：

```ts
import type { ServerWebSocket } from "bun";
import { upgradeWebSocket } from "hono/bun";
import { env } from "@/env";
import { getAuthVars } from "@/modules/auth/auth.middleware";
import {
  aiService,
  forwardEvents,
  toRenderMessages,
} from "./ai.service";

// Origin 白名单：CORS_ORIGIN（若配置）+ WEBAUTHN_ORIGINS。
// 防跨站 WebSocket 劫持：生产 cookie SameSite=None，任意网站可带 cookie 发起
// WS 握手（浏览器对 WS 不做 CORS 预检），必须校验 Origin。
const ALLOWED_ORIGINS = new Set<string>();
if (process.env.CORS_ORIGIN) ALLOWED_ORIGINS.add(process.env.CORS_ORIGIN);
for (const origin of env.WEBAUTHN_ORIGINS) ALLOWED_ORIGINS.add(origin);

export function isAllowedOrigin(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true; // 无 Origin 头 = 同源/非浏览器客户端
  return allowed.includes(origin);
}

type Conn = {
  sessionId?: string;
  unsubscribe?: () => void;
  pending: string[];
};

const connections = new Map<ServerWebSocket, Conn>();

function safeSend(ws: ServerWebSocket, json: string) {
  try {
    if (ws.readyState === 1) ws.send(json);
  } catch {
    // socket 已关闭等情况静默忽略
  }
}

export const aiWebSocket = upgradeWebSocket((c) => {
  // Origin 校验（握手时）：不在白名单 → 返回非 101 响应拒绝升级
  const origin = c.req.header("Origin");
  if (!isAllowedOrigin(origin, [...ALLOWED_ORIGINS])) {
    return { onOpen: () => {} }; // 实际拒绝在 handler 内完成（见下）
  }
  // 认证在现有 authMiddleware 中已完成（/api/* 全部经过）；此处取身份：
  const auth = getAuthVars(c);

  return {
    async onOpen(evt, ws) {
      const conn: Conn = { pending: [] };
      connections.set(ws, conn);
      try {
        if (!(await aiService.isAiEnabled())) {
          throw new Error("AI 未配置模型凭据（检查 DEEPSEEK_API_KEY / AI_MODEL）");
        }
        const { sm, session } = await aiService.openRecentOrCreate();
        conn.sessionId = sm.getSessionId();
        conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
        safeSend(
          ws,
          JSON.stringify({
            type: "session_ready",
            sessionId: conn.sessionId,
            model: `${session.model?.provider}/${session.model?.id}`,
            messages: toRenderMessages(session.messages),
          }),
        );
        for (const raw of conn.pending) handleMessage(ws, raw);
        conn.pending = [];
      } catch (err) {
        safeSend(
          ws,
          JSON.stringify({ type: "error", message: (err as Error).message }),
        );
        ws.close();
      }
    },
    onMessage(evt, ws) {
      handleMessage(ws, String(evt.data));
    },
    onClose(_evt, ws) {
      const conn = connections.get(ws);
      if (conn?.unsubscribe) conn.unsubscribe();
      if (conn?.sessionId) aiService.releaseSession(conn.sessionId);
      connections.delete(ws);
    },
  };
});

async function handleMessage(ws: ServerWebSocket, raw: string) {
  const conn = connections.get(ws);
  if (!conn) return;
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return safeSend(ws, JSON.stringify({ type: "error", message: "非法消息" }));
  }

  switch (msg.type) {
    case "prompt":
    case "steer":
    case "followUp": {
      const { sm, session } = conn.sessionId
        ? await ensureOpen(conn.sessionId)
        : await aiService.openRecentOrCreate();
      conn.sessionId = sm.getSessionId();
      const p =
        msg.type === "prompt"
          ? session.prompt(msg.text ?? "")
          : msg.type === "steer"
            ? session.steer(msg.text ?? "")
            : session.followUp(msg.text ?? "");
      p.catch((err) =>
        safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message })),
      );
      break;
    }
    case "abort":
      if (conn.sessionId) {
        const s = await ensureOpen(conn.sessionId);
        s.session.abort().catch(() => {});
      }
      break;
    case "list_sessions":
      aiService.listSessions().then((sessions) =>
        safeSend(ws, JSON.stringify({ type: "sessions", sessions })),
      );
      break;
    case "new_session": {
      try {
        const { sm, session } = await aiService.createNewSession();
        const prev = conn.sessionId ? await ensureOpen(conn.sessionId) : undefined;
        if (prev) prev.session.dispose();
        conn.sessionId = sm.getSessionId();
        conn.unsubscribe?.();
        conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
        safeSend(
          ws,
          JSON.stringify({
            type: "session_switched",
            sessionId: conn.sessionId,
            model: `${session.model?.provider}/${session.model?.id}`,
            messages: toRenderMessages(session.messages),
          }),
        );
        aiService.listSessions().then((sessions) =>
          safeSend(ws, JSON.stringify({ type: "sessions", sessions })),
        );
      } catch (err) {
        safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message }));
      }
      break;
    }
    case "switch_session": {
      try {
        const path = await aiService.findSessionPath(msg.sessionId);
        if (!path) {
          return safeSend(ws, JSON.stringify({ type: "error", message: `会话不存在: ${msg.sessionId}` }));
        }
        const { sm, session } = await aiService.openSession(path);
        if (conn.sessionId) aiService.releaseSession(conn.sessionId);
        conn.sessionId = sm.getSessionId();
        conn.unsubscribe?.();
        conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
        safeSend(
          ws,
          JSON.stringify({
            type: "session_switched",
            sessionId: conn.sessionId,
            model: `${session.model?.provider}/${session.model?.id}`,
            messages: toRenderMessages(session.messages),
          }),
        );
      } catch (err) {
        safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message }));
      }
      break;
    }
    case "delete_session": {
      try {
        await aiService.deleteSession(msg.sessionId);
        safeSend(ws, JSON.stringify({ type: "session_deleted", sessionId: msg.sessionId }));
        if (conn.sessionId === msg.sessionId) {
          conn.unsubscribe?.();
          const { sm, session } = await aiService.createNewSession();
          conn.sessionId = sm.getSessionId();
          conn.unsubscribe = forwardEvents((json) => safeSend(ws, json), session);
          safeSend(
            ws,
            JSON.stringify({
              type: "session_switched",
              sessionId: conn.sessionId,
              model: `${session.model?.provider}/${session.model?.id}`,
              messages: toRenderMessages(session.messages),
            }),
          );
        }
        aiService.listSessions().then((sessions) =>
          safeSend(ws, JSON.stringify({ type: "sessions", sessions })),
        );
      } catch (err) {
        safeSend(ws, JSON.stringify({ type: "error", message: (err as Error).message }));
      }
      break;
    }
    default:
      safeSend(ws, JSON.stringify({ type: "error", message: `未知消息类型: ${msg.type}` }));
  }
}

async function ensureOpen(sessionId: string) {
  const path = await aiService.findSessionPath(sessionId);
  if (!path) throw new Error(`会话不存在: ${sessionId}`);
  return aiService.openSession(path);
}
```

> 注：Origin 拒绝逻辑必须真正生效——Hono 的 `upgradeWebSocket` handler 中返回带 `onOpen` 的对象即接受升级。**拒绝写法**：在 `upgradeWebSocket` 工厂外再包一层中间件，Origin 不在白名单直接 `return c.text("Forbidden", 403)` 不进入 upgradeWebSocket。将上面 `aiWebSocket` 改为导出 `originGate` 中间件 + `upgradeWebSocket` 的组合，在 `ai.router.ts` 中：

`ai.router.ts`：

```ts
import { Hono } from "hono";
import { env } from "@/env";
import { aiWebSocket } from "./ai.handler";

export const aiRouter = new Hono();

// Origin 白名单门禁（先于 upgradeWebSocket 执行，403 拒绝升级）
const ALLOWED = new Set<string>();
if (process.env.CORS_ORIGIN) ALLOWED.add(process.env.CORS_ORIGIN);
for (const origin of env.WEBAUTHN_ORIGINS) ALLOWED.add(origin);

aiRouter.use("/ws", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && !ALLOWED.has(origin)) {
    return c.text("Forbidden", 403);
  }
  await next();
});
aiRouter.get("/ws", aiWebSocket);
```

- [ ] **Step 5: 接线 app.ts + index.ts**

`app.ts`：`import { aiRouter } from "@/modules/ai";` 并在模块区追加 `app.route("/api", aiRouter);`。

`index.ts` 改造为：

```ts
import { createBunWebSocket } from "hono/bun";

const { upgradeWebSocket, websocket } = createBunWebSocket();
// 现有 createApp(env) 不变；把 upgradeWebSocket 通过 app.ts 的 ai.router 使用。
```

> 注：`createBunWebSocket()` 的 `upgradeWebSocket` 与 `websocket` 必须在同一调用返回（同一底层 handler 实例）。因此**不能在 ai.handler.ts 里单独调 createBunWebSocket**——正确做法：在 `index.ts`（或 `app.ts`）创建一次：

```ts
// index.ts
import { createBunWebSocket } from "hono/bun";

const { upgradeWebSocket, websocket } = createBunWebSocket();
const app = createApp(env, { upgradeWebSocket });

export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket, // ← Bun.serve 需要 websocket handlers，否则 WS 升级 404
};
```

`app.ts` 签名改为 `createApp(env: Env, ws: { upgradeWebSocket: typeof upgradeWebSocket })`，并把 `upgradeWebSocket` 传给 `aiRouter`（`aiRouter` 工厂改为 `createAiRouter(upgradeWebSocket)`）。相应地：`ai.handler.ts` 的 `upgradeWebSocket` import 改为参数注入，`aiWebSocket` 改为 `createAiWebSocket(upgradeWebSocket)`。**本任务最终形状**：`index.ts` 持有 `createBunWebSocket()` 的单例并传给 `createApp` → `createAiRouter(upgradeWebSocket)` → handler 使用注入的 helper。实施时按此依赖链调整，保证 `upgradeWebSocket` 与 `websocket` 同源。

- [ ] **Step 6: 验证**

```bash
cd services/api && bun test src/modules/ai/ && bun run typecheck
```

Expected: 全部通过。`app.test.ts` 若因 `createApp` 签名变化报错，更新为传 `{ upgradeWebSocket }`（可用 `createBunWebSocket()` 的返回值或测试桩）。

- [ ] **Step 7: Commit**

```bash
git add services/api/src/modules/ai/ services/api/src/app.ts services/api/src/index.ts
git commit -m "feat: add ai websocket protocol layer"
```

---

### Task 6: 集成测试（faux provider + 真实 DB）

**Files:**
- Create: `services/api/src/modules/ai/ai.integration.test.ts`

**Interfaces:**
- Consumes: `aiService`、`buildAiTools()`；pi-ai 的 `fauxProvider()`。

- [ ] **Step 1: 写测试**

```ts
// 门控：RUN_DB_TESTS=1（与其它模块集成测试一致）
import { describe, expect, test } from "bun:test";
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const runDb = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runDb)("ai.integration", () => {
  test("faux provider 驱动 agent 调用 create_task 工具落库", async () => {
    // 1. 注册 faux provider（本地假模型，不发真实 API）
    const faux = fauxProvider();
    const modelRuntime = await ModelRuntime.create({ models: faux.models });

    // 2. 预置响应：先 toolCall，再最终文本
    faux.setResponses([
      fauxAssistantMessage("我来创建任务。", {
        toolCall: fauxToolCall("create_task", { title: "AI 集成测试任务", dueDate: "2026-08-10" }),
      }),
      fauxAssistantMessage("任务已创建完成。"),
    ]);

    // 3. 建会话（临时目录，避免污染 .data/sessions）
    const tmp = await Bun.$`mktemp -d`.text();
    const { createAgentSession, SessionManager, SettingsManager, DefaultResourceLoader } =
      await import("@earendil-works/pi-coding-agent");
    const sm = SessionManager.create(process.cwd(), `${tmp}/sessions`);
    const session = await createAgentSession({
      sessionManager: sm,
      settingsManager: SettingsManager.inMemory(),
      modelRuntime,
      model: faux.model,
      customTools: buildAiTools(),
      excludedToolNames: ["bash", "read", "edit", "write", "grep", "find", "ls"],
      // loader 用最小隔离配置（无扩展）
      resourceLoader: await (async () => {
        const l = new DefaultResourceLoader({
          cwd: process.cwd(),
          agentDir: process.cwd(),
          settingsManager: SettingsManager.inMemory(),
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          systemPromptOverride: () => "你是测试助手。",
          appendSystemPromptOverride: () => [],
        });
        await l.reload();
        return l;
      })(),
    });

    // 4. 跑一轮
    await session.prompt("帮我创建一个任务：写周报，截止明天");

    // 5. 断言：DB 里出现该任务（真实 taskService 落库）
    const tasks = await taskService.listTasks({ page: 1, pageSize: 50 });
    const created = tasks.items.find((t) => t.title === "AI 集成测试任务");
    expect(created).toBeDefined();
    expect(created?.dueDate).toBe("2026-08-10");

    session.dispose();
  });
});
```

> 若 `fauxProvider` / `ModelRuntime.create({ models })` 签名与 pi-ai 0.84.1 实际不符（对照 `pi-ai/dist/providers/faux.d.ts`），以实际签名为准（目标不变：不发起真实网络，agent 按预置响应调用 `create_task` 并真实落库）。

- [ ] **Step 2: 运行**

```bash
cd services/api && bun run test:db:up && bun run db:migrate && RUN_DB_TESTS=1 bun test src/modules/ai/ai.integration.test.ts
```

Expected: PASS（faux 驱动 agent 调用工具 → 任务落库断言成功）。之后 `bun run test:db:down`。

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/ai/ai.integration.test.ts
git commit -m "test: add ai integration test with faux provider"
```

---

### Task 7: 部署改动

**Files:**
- Modify: `services/api/Dockerfile`
- Modify: `.env.example`
- Modify: `AGENTS.md`（Docker 一节补 AI env 与第二个卷）

- [ ] **Step 1: Dockerfile 建会话目录**

`services/api/Dockerfile` 中现有 `mkdir -p /data/blobs` 一行改为：

```dockerfile
  && mkdir -p /data/blobs /data/sessions \
  && chown -R serenique:serenique /home/serenique /data/blobs /data/sessions
```

- [ ] **Step 2: .env.example 补 AI 配置**

在 `.env.example` 追加（注释风格对齐现有条目）：

```sh
# ---- AI 助手（宁序）----
# DeepSeek 官方 API 凭据（pi-ai 直接读 process.env；缺失时 AI 按连接报错）
DEEPSEEK_API_KEY=
# 模型选择 "provider/modelId"（缺省 deepseek/deepseek-v4-flash）
AI_MODEL=
# AI 会话目录（缺省：生产 /data/sessions，dev ./data/sessions）
AI_SESSION_DIR=
```

- [ ] **Step 3: AGENTS.md Docker 一节**

`docker run` 示例补：

```sh
  -e DEEPSEEK_API_KEY=<key> \
  -e AI_MODEL=deepseek/deepseek-v4-flash \
  -v /host/sessions:/data/sessions \
```

- [ ] **Step 4: 验证（镜像体积基线记录）**

```bash
docker build -t serenique-api-ai -f services/api/Dockerfile .
```

Expected: 构建成功（体积较此前膨胀 150~250MB 属预期）。若构建容器无法访问 npm registry，按 `.ai/runbooks/docker-local-build.md` 注入代理 build args。

- [ ] **Step 5: Commit**

```bash
git add services/api/Dockerfile .env.example AGENTS.md
git commit -m "chore: deploy ai module (sessions volume, model creds)"
```

---

## 完成后核对（Self-review）

- [ ] `bun run typecheck`（api 内）+ `bun test`（api 内）全绿
- [ ] `bun run test:integration:full` 全绿（含 ai.integration）
- [ ] 用 curl/websocat 对 `ws://localhost:3000/api/ai/ws` 手动冒烟：未认证 → 401/403；带 cookie 连接 → `session_ready`
- [ ] 需求文档 §4.1/4.2/4.3/4.5 全部落实；决策表 #4/#7/#10/#11 无偏差
- [ ] `exports.ts` 未导出 aiService
