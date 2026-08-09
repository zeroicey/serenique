import { describe, expect, test, mock } from "bun:test";

// ai.tools 的 import 链（event/moment service → db/connection → @/env）在模块
// 加载时解析 process.env 并要求 DATABASE_URL / BLOB_ROOT（env.ts: z.url()），
// 而 bun test 不加载仓库根 .env；单文件运行（bun test src/modules/ai/ai.tools.test.ts）
// 时由这里强制注入。全量运行时 env 已被其他测试文件缓存（bun test 单进程、
// 先 import 先赢——见 src/test/helpers.ts 注释），注入不会生效，但下面 mock 的
// 错误路径与 env 无关，两种情况结果一致。
process.env.DATABASE_URL =
  "postgresql://serenique:serenique@127.0.0.1:1/serenique";
process.env.BLOB_ROOT = "/tmp/serenique-ai-tools-test";

// create_task 的 execute 会先走 resolveGroupId → taskService.listTaskGroups。
// mock 掉 task.service 让该调用抛错，模拟无数据库环境：断言 execute 因此
// reject（「操作失败」包装），测试确定性成立，且不依赖真实库可用性、不产生
// 真实写入。
mock.module("@/modules/task/task.service", () => ({
  taskService: {
    listTaskGroups: async () => {
      throw new Error("模拟无数据库");
    },
  },
}));

const { buildAiTools } = await import("./ai.tools");

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
    // 通过 execute 校验 schema 是否放行（groupId 省略）。
    // 无 DB（mock 抛错）时 run() 抛「操作失败: …」→ execute reject，此处
    // 只断言 rejection 本身（错误映射由 SDK runner 负责，不在本文件范围）。
    await expect(
      tool.execute("c1", { title: "写周报" }, undefined, undefined, {} as any),
    ).rejects.toThrow("操作失败");
  });
});
