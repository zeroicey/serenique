import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { RUN_DB_TESTS, setTestEnv, uniqueTitle } from "@/test/helpers";

// ---------------------------------------------------------------------------
// AI 助手端到端集成测试 — pi-ai faux provider（本地假模型，预置响应、不发
// 真实 API）+ 真实 PostgreSQL。验证：agent 收到预置的 toolCall 响应后真的
// 执行 create_task 工具，任务真实落库。
//
// GATED: RUN_DB_TESTS=1（与其它模块集成测试一致），否则整个 suite skip。
//
//   cd services/api && bun run test:db:up && bun run test:db:migrate \
//     && RUN_DB_TESTS=1 bun test src/modules/ai/ai.integration.test.ts
//
// ⚠️ 不要用 `RUN_DB_TESTS=1 bun test src/modules/ai/`（整个目录 + DB）：
// ai.tools.test.ts 用 mock.module 全局替换 @/modules/task/task.service
// （bun 的 mock.module 是进程级、mock.restore() 不可撤销，见 bun 文档），
// 同进程内本文件拿到的 taskService 是「模拟无数据库」假实现，beforeAll 必挂。
// 正确姿势：单文件跑（上方命令）或标准集成 glob
// （test:integration:full → src/modules/*/*.integration.test.ts，不含单元测试）。
//
// 会话文件写到 mktemp 临时目录（不污染 .data/sessions），测试结束删除；
// 创建的任务/分组在 afterAll 里删除（分组删除级联任务）。
//
// 与 SDK 0.84.1 实际 API 的差异（brief 骨架 vs 真实签名，均已实测验证）：
//   - ModelRuntime.create({ models }) 不存在 → modelsPath: null +
//     registerNativeProvider(faux.provider)（faux 的 auth 恒返回 {}，无需凭据）
//   - createAgentSession 字段名是 excludeTools（非 excludedToolNames）
//   - fauxAssistantMessage 无 { toolCall } 选项 → 用 content block 数组：
//     [fauxText(...), fauxToolCall(...)]
//   - model 用 faux.getModel()
// ---------------------------------------------------------------------------

setTestEnv();

/** 预置响应：第一轮 toolCall（create_task），第二轮最终文本。 */
const TOOL_CALL_TITLE = "AI 集成测试任务";
const TOOL_CALL_DUE_DATE = "2026-08-10";

describe.skipIf(!RUN_DB_TESTS)("ai.integration", () => {
  const createdTaskIds: string[] = [];
  let createdGroupId: string | undefined;
  let tmpDir: string;

  beforeAll(async () => {
    const taskService = (await import("@/modules/task/task.service")).taskService;
    // 保证 resolveGroupId 有组可落：库里没有任务组时先建一个（afterAll 删除），
    // 有则复用首个组（只删任务，不碰既有组）。
    const groups = await taskService.listTaskGroups({ page: 1, pageSize: 50 });
    if (groups.items.length === 0) {
      createdGroupId = (await taskService.createTaskGroup({ title: uniqueTitle("ai-组") })).id;
    }
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS) return;
    const taskService = (await import("@/modules/task/task.service")).taskService;
    for (const id of createdTaskIds) {
      await taskService.deleteTask({ id }).catch(() => {});
    }
    if (createdGroupId) {
      await taskService
        .deleteTaskGroup({ id: createdGroupId })
        .catch(() => {});
    }
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test("faux provider 驱动 agent 调用 create_task 工具落库", async () => {
    // 1. 注册 faux provider：独立 ModelRuntime（不碰 ~/.pi/agent 的
    //    models.json / auth.json，modelsPath: null → 内存 store，不发网络）。
    const faux = fauxProvider();
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      refreshOnCreate: false,
    });
    modelRuntime.registerNativeProvider(faux.provider);

    // 2. 预置响应：先 toolCall，再最终文本（本地假模型，不发真实 API）
    faux.setResponses([
      fauxAssistantMessage([
        fauxText("我来创建任务。"),
        fauxToolCall("create_task", {
          title: TOOL_CALL_TITLE,
          dueDate: TOOL_CALL_DUE_DATE,
        }),
      ]),
      fauxAssistantMessage("任务已创建完成。"),
    ]);

    // 3. 建会话：临时目录放 session 文件，loader 最小隔离（无扩展/技能/上下文）
    tmpDir = mkdtempSync(join(tmpdir(), "serenique-ai-test-"));
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: process.cwd(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => "你是测试助手。",
      appendSystemPromptOverride: () => [],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      sessionManager: SessionManager.create(process.cwd(), join(tmpDir, "sessions")),
      settingsManager,
      modelRuntime,
      model: faux.getModel(),
      customTools: (await import("./ai.tools")).buildAiTools(),
      excludeTools: ["bash", "read", "edit", "write", "grep", "find", "ls"],
      resourceLoader: loader,
    });

    try {
      // 4. 跑一轮：faux 按预置响应返回 toolCall → agent 执行 create_task →
      //    toolResult 回填 → 第二轮 faux 返回最终文本，回合结束。
      await session.prompt("帮我创建一个任务：写周报，截止明天");

      // 5. 断言：真实 taskService 落库
      const taskService = (await import("@/modules/task/task.service")).taskService;
      const tasks = await taskService.listTasks({ page: 1, pageSize: 50 });
      const created = tasks.items.find((t) => t.title === TOOL_CALL_TITLE);
      expect(created).toBeDefined();
      expect(created?.dueDate).toBe(TOOL_CALL_DUE_DATE);
      if (created) createdTaskIds.push(created.id);
    } finally {
      session.dispose();
    }
  });
});
