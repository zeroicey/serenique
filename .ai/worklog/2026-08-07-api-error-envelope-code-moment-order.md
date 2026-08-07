# 2026-08-07 — API 两个缺陷修复：moment 列表倒序 + 错误响应补 `code`

`services/api` 两个确认 bug 修复（TDD：先写失败测试 → 实现 → 验证通过）。

## 修复 1：moment 列表改为最新在前

`src/modules/moment/moment.service.ts` 的 `list()` 原来 `.orderBy(moments.createdAt)` 升序，最早的一条排最前。改为 `.orderBy(desc(moments.createdAt))`，`desc` 从 `drizzle-orm` 引入（原 import 已有 `and, eq, inArray, sql`）。纯展示顺序修复，未加 `sort` 参数、未动 schema。

测试：`src/modules/moment/moment.service.integration.test.ts` 新增「list returns moments newest-first」——插入 3 条，显式 `db.update().set({ createdAt })` 写死 2030-01-01/02/03（`defaultNow()` 可能落在同一毫秒，且未来日期保证 DESC 下排在最前），断言 `list` 返回顺序 `[c, b, a]`。既有的「list returns moments with only their own attachments」只做过滤+附件断言，不依赖旧升序，无需改。

## 修复 2：错误响应统一补 `code` 字段

根因：CLAUDE.md 文档化的统一响应 `{ success, code, message, data?, error? }` 里 `code` 从未真正输出——`Res.error()` 及所有错误 builder 只产出 `{ success, message }`，导致移动端 `e.code == 'NOT_FOUND'` 判据失效，各端打了一堆 workaround。

- `src/shared/response.ts`：`ResBuilder` 加 `private _code` + `code(code: string): this`；`build()` 在 `_code` 已设置时输出 `body.code`。所有具名错误 shortcut（`badRequest`/`validationFailed`/`unauthorized`/`forbidden`/`notFound`/`conflict`/`internalError`）带默认 code（`VALIDATION`/`UNAUTHORIZED`/`FORBIDDEN`/`NOT_FOUND`/`CONFLICT`/`INTERNAL`）；`error()` 保持无默认（由 handleError 显式链 `.code()`）。**成功响应与 204 不含 code**。
- `src/shared/handler.ts` `handleError()` 全分支串 code：`AppError → .code(e.code)`、`ZodError → .code(ErrorCode.VALIDATION)`、`SyntaxError → .code(ErrorCode.VALIDATION)`、未知 → `.code(ErrorCode.INTERNAL)`。
- 效果：「今日无日记」404 现在是 `{ success: false, code: "NOT_FOUND", message: "日记不存在" }`。

测试（原无 `response.test.ts`/`handler.test.ts`，均为新建）：
- `src/shared/response.test.ts`：`.code()` 进 body、各 error shortcut 默认 code、成功/204 不含 code（204 仍无 body）。
- `src/shared/handler.test.ts`：真实 Hono app + `handleError`，覆盖 AppError/ZodError/SyntaxError/unknown 四分支的 status 与 code。

## 验证

- `bun run typecheck` → 通过（无输出）。
- `bun test` → **101 pass / 0 fail**（68 skip = RUN_DB_TESTS 门控的集成测试）。
- `docker compose -f docker-compose.test.yml up` + `db:migrate` 后 `RUN_DB_TESTS=1 bun test src/modules/*/*.integration.test.ts` → **56 pass / 0 fail**（moment 集成含新排序用例）。跑完已 `down` 清理。

## 对下一次会话的提示

- **`handler.test.ts` 不能静态 import `@/shared/handler`**：`logger` → `@/env`，模块加载即解析 env；`setTestEnv()` 是模块顶层执行、ESM import 会提升到最前。必须 `beforeAll` 里 `await import("@/shared/handler")` 动态加载。响应测试用轻量 fake Hono Context（`json`/`body`）即可测 `Res.build`。
- `createdAt` 有 `defaultNow()`，同一毫秒内多次 insert 可能拿到相同时间戳——排序/时间断言别依赖插入顺序，显式 `update` 写死时间更稳。
- 错误响应现在**总是**带 `code`。若后续各端再遇到缺 `code` 的响应，先查是否绕过了 `handleError` 直用 `Res.error(...)`（如 `auth.handler` 登录 429/401 用的是裸 `Res.error().status()`，本次未动，属已知缺口）。
