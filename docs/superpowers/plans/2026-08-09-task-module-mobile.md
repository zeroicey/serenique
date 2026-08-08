# Task Module Mobile + dueDate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dueDate` field to the task module across API/MCP/CLI, and build the complete Flutter task module (4-tab bottom navigation: 任务组 / 今日 / 本周 / 本月) with full CRUD.

**Architecture:** The task API gains an optional `dueDate` (YYYY-MM-DD, stored as `text` column — see Global Constraints for why) plus `dueDateFrom`/`dueDateTo` list filters, synced to MCP tools and the Go CLI. The Flutter app replaces the `/task` placeholder with `TaskPage`, a nested Scaffold (outer `AppShell` provides AppBar + drawer; inner provides a `NavigationBar` with 4 tabs + tab-dependent FAB). Date views query the same `GET /api/tasks` endpoint with different range params; the 今日 view additionally splits overdue vs today on the client by string comparison.

**Tech Stack:** Bun + Hono + Drizzle (API), TypeScript (MCP, streamable-http), Go + cobra (CLI), Flutter + Riverpod + go_router (mobile).

## Global Constraints

- **dueDate storage = `text` column + CHECK regex** (`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`). Why: node-postgres parses `date`-typed columns as JS `Date` at *local midnight*; Drizzle string-mode round-trips via `toISOString().slice(0,10)`, which shifts a day for UTC+8 users (off-by-one). Text passes through untouched and YYYY-MM-DD compares correctly lexicographically.
- **dueDate contract** (all clients): absent/`undefined` = unchanged or unset; `null` = explicitly clear (update only); `""` = normalized to `null` server-side (handler zod transform; MCP wrapper; CLI sends literal `""` when `--due-date ""`).
- **Date views only show `status=todo` tasks.** 任务组 tab / group detail show all statuses.
- **本周 = Monday start** (`DateTime.weekday` 1=Mon). All date math uses the device's local timezone.
- 今日 view params: `status=todo&dueDateTo=<today>`; 本周: `dueDateFrom=<Monday>&dueDateTo=<Sunday>`; 本月: `dueDateFrom=<1st>&dueDateTo=<last day>`.
- Query param/page size limit: `pageSize` max 50 — date views and group lists fetch page 1 size 50 (personal-app scale, no infinite scroll in this iteration).
- User-visible messages in Chinese. Commit messages in English, conventional style (`feat:`, `fix:`, `chore:`).
- Delivery order: API → MCP → CLI → Flutter. Each task independently testable.

---

### Task 1: API — dueDate schema, types, domain (+ unit tests)

**Files:**
- Modify: `services/api/src/modules/task/task.schema.ts`
- Modify: `services/api/src/modules/task/task.types.ts`
- Modify: `services/api/src/modules/task/task.domain.ts`
- Modify: `services/api/src/modules/task/task.mappers.ts`
- Test: `services/api/src/modules/task/task.service.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `DueDateSchema` (exported from `task.types.ts`): zod schema for `YYYY-MM-DD` strings.
  - `UpdateTaskSchema.dueDate`: `z.union([DueDateSchema, z.literal("")]).transform(v => v === "" ? null : v).nullable().optional()`.
  - `TaskUpdateRowLike` / `TaskUpdatePatch` / `TaskUpdateResult` gain `dueDate: string | null` (row/result) and `dueDate?: string | null` (patch).
  - `toTaskEntry` output includes `dueDate: row.dueDate`.
  - `tasks` table gains `dueDate: text("due_date")` + `idx_tasks_due_date_status` index + `chk_tasks_due_date_format` check.

- [ ] **Step 1: Write failing unit tests** (append to `task.service.test.ts`)

```ts
describe("DueDateSchema — YYYY-MM-DD validation", () => {
  test("accepts valid dates, rejects bad formats", async () => {
    setTestEnv();
    const { DueDateSchema } = await import("./task.types");

    expect(DueDateSchema.parse("2026-08-09")).toBe("2026-08-09");
    expect(() => DueDateSchema.parse("2026/08/09")).toThrow();
    expect(() => DueDateSchema.parse("2026-8-9")).toThrow();
    expect(() => DueDateSchema.parse("2026-02-30")).toThrow(); // invalid calendar day
    expect(() => DueDateSchema.parse("2026-13-01")).toThrow();
  });
});

describe("UpdateTaskSchema dueDate — clear semantics", () => {
  test("null clears, '' normalizes to null, valid string passes, absent keeps", async () => {
    setTestEnv();
    const { UpdateTaskSchema } = await import("./task.types");

    expect(UpdateTaskSchema.parse({ dueDate: null })).toEqual({ dueDate: null });
    expect(UpdateTaskSchema.parse({ dueDate: "" })).toEqual({ dueDate: null });
    expect(UpdateTaskSchema.parse({ dueDate: "2026-08-09" })).toEqual({ dueDate: "2026-08-09" });
    // dueDate alone satisfies the "at least one field" refine
    expect(UpdateTaskSchema.parse({ dueDate: null }).dueDate).toBeNull();
  });
});

describe("resolveTaskUpdate — dueDate resolution", () => {
  test("absent patch keeps current; null clears; string sets", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.domain");

    const row = { title: "t", groupId: "g", status: "todo", completedAt: null, dueDate: "2026-08-09" };
    expect(resolveTaskUpdate(row, {}, NOW).dueDate).toBe("2026-08-09");
    expect(resolveTaskUpdate(row, { dueDate: null }, NOW).dueDate).toBeNull();
    expect(resolveTaskUpdate(row, { dueDate: "2026-09-01" }, NOW).dueDate).toBe("2026-09-01");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd services/api && bun test` — expect failures (DueDateSchema undefined; resolveTaskUpdate returns object without dueDate — `toBe` on undefined).

- [ ] **Step 3: Implement schema column** (`task.schema.ts`)

```ts
// add to the `tasks` table:
dueDate: text("due_date"),
// add to the (t) => [...] array:
index("idx_tasks_due_date_status").on(t.dueDate, t.status),
check(
  "chk_tasks_due_date_format",
  sql`${t.dueDate} IS NULL OR ${t.dueDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
),
```

- [ ] **Step 4: Implement types** (`task.types.ts`)

```ts
// new exported schema (place above CreateTaskSchema):
export const DueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "截止日期格式须为 YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "截止日期无效");

// CreateTaskSchema gains:
dueDate: DueDateSchema.optional(),

// UpdateTaskSchema gains (and its refine adds `v.dueDate !== undefined`):
dueDate: z
  .union([DueDateSchema, z.literal("")])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional(),

// ListTaskSchema gains:
dueDateFrom: DueDateSchema.optional(),
dueDateTo: DueDateSchema.optional(),
// …and a new refine on the whole object:
.refine(
  (v) =>
    v.dueDateFrom === undefined ||
    v.dueDateTo === undefined ||
    v.dueDateFrom <= v.dueDateTo,
  "dueDateFrom 不能晚于 dueDateTo",
),

// TaskEntry gains:
dueDate: string | null,
```

- [ ] **Step 5: Implement domain + mapper** (`task.domain.ts`, `task.mappers.ts`)

```ts
// TaskUpdateRowLike gains: dueDate: string | null;
// TaskUpdatePatch gains:   dueDate?: string | null;
// TaskUpdateResult gains:  dueDate: string | null;
// resolveTaskUpdate return gains:
dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,

// toTaskEntry gains:
dueDate: row.dueDate,
```

- [ ] **Step 6: Run tests, verify pass**

Run: `cd services/api && bun run typecheck && bun test`
Expected: all pass (existing + new).

- [ ] **Step 7: Commit**

```bash
git add services/api/src/modules/task/
git commit -m "feat: add dueDate to task schema, types, and domain logic"
```

---

### Task 2: API — service wiring + integration tests

**Files:**
- Modify: `services/api/src/modules/task/task.service.ts`
- Test: `services/api/src/modules/task/task.service.integration.test.ts`

**Interfaces:**
- Consumes: `DueDateSchema`-validated inputs from Task 1; `ListTaskInput` now carries `dueDateFrom?`/`dueDateTo?` (strings).
- Produces: `taskService.listTasks` supports range filtering + date-first ordering; `createTask`/`updateTask` persist dueDate.

- [ ] **Step 1: Write failing integration tests** (append to `task.service.integration.test.ts`)

```ts
describe("task dueDate persistence and range filtering", () => {
  test("create with dueDate persists; update clears it with null", async () => {
    const group = await taskService.createTaskGroup({ title: "测试组" });
    const task = await taskService.createTask({ groupId: group.id, title: "带截止", dueDate: "2026-08-20" });
    expect(task.dueDate).toBe("2026-08-20");

    const cleared = await taskService.updateTask({ id: task.id, dueDate: null });
    expect(cleared.dueDate).toBeNull();

    const reset = await taskService.updateTask({ id: task.id, dueDate: "2026-08-21" });
    expect(reset.dueDate).toBe("2026-08-21");
  });

  test("list filters by inclusive dueDateFrom/dueDateTo and sorts by dueDate asc", async () => {
    const group = await taskService.createTaskGroup({ title: "测试组2" });
    await taskService.createTask({ groupId: group.id, title: "过期", dueDate: "2026-08-01" });
    await taskService.createTask({ groupId: group.id, title: "中间", dueDate: "2026-08-15" });
    await taskService.createTask({ groupId: group.id, title: "未来", dueDate: "2026-09-01" });
    await taskService.createTask({ groupId: group.id, title: "无日期" });

    const inRange = await taskService.listTasks({
      page: 1, pageSize: 50, status: "todo",
      dueDateFrom: "2026-08-01", dueDateTo: "2026-08-31",
    });
    expect(inRange.items.map((t) => t.title)).toEqual(["过期", "中间"]);

    const combined = await taskService.listTasks({
      page: 1, pageSize: 50, status: "todo", dueDateTo: "2026-08-01",
    });
    expect(combined.items.map((t) => t.title)).toEqual(["过期"]);
    expect(combined.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run integration tests, verify they fail**

Run: `cd services/api && RUN_DB_TESTS=1 bun run test:integration:full`
Expected: FAIL — `task.dueDate` undefined (column missing) / filtering returns all tasks.

- [ ] **Step 3: Implement service** (`task.service.ts`)

```ts
// import: add asc, gte, lte to the drizzle-orm import.

// createTask .values() gains:
dueDate: input.dueDate ?? null,

// updateTask .set() gains:
dueDate: resolved.dueDate,

// listTasks conditions array gains:
input.dueDateFrom ? gte(tasks.dueDate, input.dueDateFrom) : undefined,
input.dueDateTo ? lte(tasks.dueDate, input.dueDateTo) : undefined,

// listTasks ordering becomes:
const orderBy =
  input.dueDateFrom !== undefined || input.dueDateTo !== undefined
    ? [asc(tasks.dueDate), desc(tasks.createdAt)]
    : [desc(tasks.createdAt)];
// …and .orderBy(...orderBy)
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd services/api && bun test && RUN_DB_TESTS=1 bun run test:integration:full`
Expected: all pass. (If the local dev DB is absent, note `test:integration:full` requires a running Postgres — see `.ai/runbooks` or existing dev workflow; at minimum unit tests must pass.)

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/task/task.service.ts services/api/src/modules/task/task.service.integration.test.ts
git commit -m "feat: wire task dueDate into service create/update/list"
```

---

### Task 3: API — Drizzle migration

**Files:**
- Create: `services/api/drizzle/0013_*.sql` (name from drizzle-kit)
- Test: `services/api/src/db/schema.ts` exports unchanged (verify compile)

**Interfaces:**
- Consumes: schema changes from Task 1.
- Produces: `tasks.due_date` column + index + CHECK in the database.

- [ ] **Step 1: Generate the migration**

Run: `cd services/api && bun run db:generate -- --name=add_task_due_date`
(`db:generate` needs a TTY; if the shell lacks one, hand-write the SQL file as shown below instead.)

Expected generated SQL (hand-written fallback — verify it matches Drizzle's output):

```sql
ALTER TABLE "tasks" ADD COLUMN "due_date" text;
CREATE INDEX IF NOT EXISTS "idx_tasks_due_date_status" ON "tasks" USING btree ("due_date","status");
```

Also add the CHECK constraint if `db:generate` emits it; if not emitted, add it manually to the same migration:

```sql
ALTER TABLE "tasks" ADD CONSTRAINT "chk_tasks_due_date_format" CHECK ("due_date" IS NULL OR "due_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
```

- [ ] **Step 2: Apply and verify**

Run: `cd services/api && bun run db:migrate` (dev DB), then `psql`/drizzle check:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='due_date';
```

- [ ] **Step 3: Run full unit suite**

Run: `cd services/api && bun test`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add services/api/drizzle/
git commit -m "chore: add migration for tasks due_date column"
```

---

### Task 4: MCP — dueDate tool parameters

**Files:**
- Modify: `services/mcp/src/tools/task.tools.ts`

**Interfaces:**
- Consumes: `CreateTaskSchema`, `ListTaskSchema` from `@serenique/api` (now carry dueDate fields); `taskService.updateTask` direct call.
- Produces: `create_task` accepts `dueDate`; `list_tasks` accepts `dueDateFrom`/`dueDateTo`; `update_task` accepts `dueDate` (string or `""`-clear, normalized to null in the wrapper).

- [ ] **Step 1: Update tool schemas**

```ts
// CreateTaskToolSchema — add after `status`:
dueDate: CreateTaskSchema.shape.dueDate.describe("截止日期 (YYYY-MM-DD)，可选"),

// ListTaskToolSchema — add after `status`:
dueDateFrom: ListTaskSchema.shape.dueDateFrom.describe("按截止日期范围过滤起点 (YYYY-MM-DD)，可选"),
dueDateTo: ListTaskSchema.shape.dueDateTo.describe("按截止日期范围过滤终点 (YYYY-MM-DD)，可选"),

// UpdateTaskToolSchema — add field (schema is hand-rebuilt; keep the refine):
dueDate: z
  .string()
  .optional()
  .describe("新的截止日期 (YYYY-MM-DD)，传空串表示清除，不传表示保持不变"),
```

- [ ] **Step 2: Normalize `""` → `null` in the update wrapper**

```ts
async (input) =>
  runTool(() =>
    taskService.updateTask({
      ...input,
      dueDate: input.dueDate === "" ? null : input.dueDate,
    }),
  ),
```

- [ ] **Step 3: Verify**

Run: `bun test` at repo root (MCP tests), and `cd services/mcp && bun run typecheck`.
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add services/mcp/src/tools/task.tools.ts
git commit -m "feat: add dueDate params to MCP task tools"
```

---

### Task 5: CLI — client structs

**Files:**
- Modify: `apps/cli/internal/client/task.go`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TaskEntry.DueDate *string` (`json:"dueDate"`), `CreateTaskInput.DueDate string` (`json:"dueDate,omitempty"`), `UpdateTaskInput.DueDate *string` (`json:"dueDate,omitempty"` — nil = unchanged, non-nil empty string = clear).

- [ ] **Step 1: Add fields**

```go
// TaskEntry gains:
DueDate *string `json:"dueDate"`

// CreateTaskInput gains:
DueDate string `json:"dueDate,omitempty"`

// UpdateTaskInput gains:
DueDate *string `json:"dueDate,omitempty"`
```

- [ ] **Step 2: Verify compile + existing tests**

Run: `cd apps/cli && go build ./... && go vet ./... && go test ./...`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/internal/client/task.go
git commit -m "feat: sync task dueDate in CLI client structs"
```

---

### Task 6: CLI — command flags and output

**Files:**
- Modify: `apps/cli/cmd/task.go`
- Test: `apps/cli/cmd/task_test.go`

**Interfaces:**
- Consumes: client structs from Task 5 (`CreateTaskInput`, `UpdateTaskInput`, `TaskEntry.DueDate`).
- Produces: `task create --due-date`, `task update --due-date`, `task list --due-from/--due-to`; table columns 截止日期.

- [ ] **Step 1: Write failing tests** (append to `cmd/task_test.go`)

```go
func TestTaskCreateSendsDueDate(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"写周报","status":"todo","dueDate":"2026-08-09","createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z","completedAt":null}}`))
	}, true, func(srv *httptest.Server) {
		taskCreateTitle = "写周报"
		taskCreateGroupID = "g1"
		taskCreateDueDate = "2026-08-09"
		t.Cleanup(func() { taskCreateTitle = ""; taskCreateGroupID = ""; taskCreateDueDate = "" })
		if err := taskCreateCmd.RunE(taskCreateCmd, nil); err != nil {
			t.Fatal(err)
		}
	})
	if gotBody["dueDate"] != "2026-08-09" {
		t.Fatalf("expected dueDate in body, got %v", gotBody)
	}
}

func TestTaskUpdateSendsEmptyDueDateToClear(t *testing.T) {
	var gotBody map[string]any
	runWithServer(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"ok","data":{"id":"t1","groupId":"g1","title":"写周报","status":"todo","dueDate":null,"createdAt":"2026-08-05T00:00:00Z","updatedAt":"2026-08-05T00:00:00Z","completedAt":null}}`))
	}, true, func(srv *httptest.Server) {
		taskUpdateTitle = "写周报"
		t.Cleanup(func() { taskUpdateTitle = "" })
		_ = taskUpdateCmd.Flags().Set("title", "写周报")
		_ = taskUpdateCmd.Flags().Set("due-date", "")
		// cmd.Flags().Set marks Changed; test asserts "" is serialized, not omitted
		if err := taskUpdateCmd.RunE(taskUpdateCmd, []string{"t1"}); err != nil {
			t.Fatal(err)
		}
		resetFlagChanged(taskUpdateCmd)
	})
	if gotBody["dueDate"] != "" {
		t.Fatalf("expected empty dueDate (clear), got %v", gotBody["dueDate"])
	}
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd apps/cli && go test ./cmd/ -run TestTaskCreateSendsDueDate -count=1`
Expected: FAIL — `dueDate` missing from body.

- [ ] **Step 3: Implement flags and output**

```go
// task create: add flag + include in input
taskCreateCmd.Flags().StringVarP(&taskCreateDueDate, "due-date", "d", "", "截止日期 (YYYY-MM-DD)")
var taskCreateDueDate string
// RunE: input := client.CreateTaskInput{ Title: taskCreateTitle, GroupID: taskCreateGroupID, Status: taskCreateStatus, DueDate: taskCreateDueDate }
// (empty DueDate stays "" → omitempty drops it)

// task update: add flag + Changed handling
taskUpdateCmd.Flags().StringVarP(&taskUpdateDueDate, "due-date", "d", "", "新截止日期 (YYYY-MM-DD)，传空串清除")
var taskUpdateDueDate string
// RunE, inside the Changed block:
if cmd.Flags().Changed("due-date") {
	input.DueDate = &taskUpdateDueDate // literal "" = clear (API normalizes to null)
	changed = true
}
// update the "至少需要提供一个待更新字段" error text to include --due-date

// task list: add flags + extraQuery
taskListCmd.Flags().StringVarP(&taskListDueFrom, "due-from", "", "", "按截止日期范围过滤起点 (YYYY-MM-DD)")
taskListCmd.Flags().StringVarP(&taskListDueTo, "due-to", "", "", "按截止日期范围过滤终点 (YYYY-MM-DD)")
var taskListDueFrom, taskListDueTo string
// extraQuery gains:
if taskListDueFrom != "" { q.Set("dueDateFrom", taskListDueFrom) }
if taskListDueTo != "" { q.Set("dueDateTo", taskListDueTo) }

// table output: add "截止日期" column to task list headers/row and to create/get/update key/value maps:
"截止日期": nullableStr(t.DueDate),
// task list headers: []string{"ID", "任务组", "标题", "状态", "截止日期", "创建时间"}
```

- [ ] **Step 4: Run full CLI verification**

Run: `cd apps/cli && go build ./... && go vet ./... && go test -count=1 ./...`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/cmd/task.go apps/cli/cmd/task_test.go
git commit -m "feat: add --due-date and --due-from/--due-to flags to CLI task commands"
```

---

### Task 7: Flutter — models, API client, date helpers (+ unit tests)

**Files:**
- Create: `apps/mobile/lib/features/task/task_models.dart`
- Modify: `apps/mobile/lib/features/task/task_api.dart`
- Create: `apps/mobile/lib/features/task/task_time.dart`
- Test: `apps/mobile/test/features/task/task_time_test.dart`

**Interfaces:**
- Consumes: `ApiClient` (`getData`/`postData`/`putData`/`deleteData`), `unwrapItems` from `core/network/unwrap.dart`.
- Produces:
  - `TaskEntry` (`id, groupId, title, status, createdAt, updatedAt, completedAt?, dueDate?`), `TaskGroupEntry` (`id, title, createdAt, updatedAt`) — `fromJson` factories.
  - `TaskApi.listGroups()`, `createGroup(title)`, `updateGroup(id, title)`, `deleteGroup(id)`, `listTasks({groupId, status, dueDateFrom, dueDateTo})`, `createTask({title, groupId, dueDate})`, `updateTask(id, {title, groupId, status, dueDate})` (explicit `null` clears), `deleteTask(id)`; keep `countUncompleted()`.
  - `task_time.dart` pure helpers: `todayStr()`, `mondayOf(DateTime)`, `weekRange() -> (String, String)`, `monthRange() -> (String, String)`, `dueDateLabel(String? dueDate) -> String` (今天/明天/M月d日/已过期), `dateStr(DateTime) -> String` (YYYY-MM-DD).

- [ ] **Step 1: Write failing unit tests** (`apps/mobile/test/features/task/task_time_test.dart`)

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/task/task_time.dart';

void main() {
  test('dateStr pads month/day', () {
    expect(dateStr(DateTime(2026, 8, 9)), '2026-08-09');
    expect(dateStr(DateTime(2026, 12, 31)), '2026-12-31');
  });

  test('mondayOf rolls back to Monday', () {
    // 2026-08-09 is a Sunday → Monday is 08-03
    expect(dateStr(mondayOf(DateTime(2026, 8, 9))), '2026-08-03');
    // 2026-08-10 is a Monday → itself
    expect(dateStr(mondayOf(DateTime(2026, 8, 10))), '2026-08-10');
  });

  test('monthRange spans first to last day', () {
    final (from, to) = monthRange(DateTime(2026, 8, 15));
    expect(from, '2026-08-01');
    expect(to, '2026-08-31');
    final (f2, t2) = monthRange(DateTime(2026, 2, 1));
    expect(t2, '2026-02-28');
  });

  test('dueDateLabel distinguishes today/tomorrow/other', () {
    expect(dueDateLabel('2026-08-09', today: DateTime(2026, 8, 9)), '今天');
    expect(dueDateLabel('2026-08-10', today: DateTime(2026, 8, 9)), '明天');
    expect(dueDateLabel('2026-08-20', today: DateTime(2026, 8, 9)), '8月20日');
  });
}
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd apps/mobile && flutter test test/features/task/task_time_test.dart`
Expected: FAIL — file missing.

- [ ] **Step 3: Implement `task_time.dart`**

```dart
/// 纯日期工具：全部基于设备本地时区，输出 YYYY-MM-DD 字符串（与 API 的
/// dueDate 契约一致，字符串可直接字典序比较）。
String dateStr(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String todayStr() => dateStr(DateTime.now());

DateTime mondayOf(DateTime d) =>
    DateTime(d.year, d.month, d.day - (d.weekday - 1)); // weekday: 1=Mon..7=Sun

/// 本周 [周一, 周日] 的 YYYY-MM-DD 字符串对。
(String, String) weekRange([DateTime? now]) {
  final monday = mondayOf(now ?? DateTime.now());
  final sunday = DateTime(monday.year, monday.month, monday.day + 6);
  return (dateStr(monday), dateStr(sunday));
}

/// 本月 [1号, 月末] 的 YYYY-MM-DD 字符串对。
(String, String) monthRange([DateTime? now]) {
  final d = now ?? DateTime.now();
  final first = DateTime(d.year, d.month, 1);
  final last = DateTime(d.year, d.month + 1, 0); // 下月第 0 天 = 本月末
  return (dateStr(first), dateStr(last));
}

/// dueDate 的展示标签：今天 / 明天 / M月d日。today 可注入便于测试。
String dueDateLabel(String dueDate, {DateTime? today}) {
  final t = today ?? DateTime.now();
  final d = DateTime.parse(dueDate);
  final diff = DateTime(d.year, d.month, d.day).difference(DateTime(t.year, t.month, t.day)).inDays;
  if (diff == 0) return '今天';
  if (diff == 1) return '明天';
  return '${d.month}月${d.day}日';
}
```

- [ ] **Step 4: Implement `task_models.dart`**

```dart
class TaskEntry {
  const TaskEntry({
    required this.id,
    required this.groupId,
    required this.title,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.completedAt,
    this.dueDate,
  });

  final String id;
  final String groupId;
  final String title;
  final String status; // todo / done / abandon
  final String createdAt;
  final String updatedAt;
  final String? completedAt;
  final String? dueDate; // YYYY-MM-DD

  factory TaskEntry.fromJson(Map<String, dynamic> json) => TaskEntry(
        id: json['id'] as String,
        groupId: json['groupId'] as String,
        title: json['title'] as String,
        status: json['status'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
        completedAt: json['completedAt'] as String?,
        dueDate: json['dueDate'] as String?,
      );
}

class TaskGroupEntry {
  const TaskGroupEntry({required this.id, required this.title, required this.createdAt, required this.updatedAt});
  final String id;
  final String title;
  final String createdAt;
  final String updatedAt;

  factory TaskGroupEntry.fromJson(Map<String, dynamic> json) => TaskGroupEntry(
        id: json['id'] as String,
        title: json['title'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
```

- [ ] **Step 5: Extend `task_api.dart`** (keep existing `countUncompleted`)

```dart
import 'task_models.dart';

Future<List<TaskGroupEntry>> listGroups() async {
  final data = await _client.getData('/api/task-groups', query: {'page': 1, 'pageSize': 50});
  return unwrapItems(data).map((e) => TaskGroupEntry.fromJson(e as Map<String, dynamic>)).toList();
}

Future<TaskGroupEntry> createGroup(String title) async {
  final data = await _client.postData('/api/task-groups', body: {'title': title});
  return TaskGroupEntry.fromJson(data as Map<String, dynamic>);
}

Future<TaskGroupEntry> updateGroup(String id, String title) async {
  final data = await _client.putData('/api/task-groups/$id', body: {'title': title});
  return TaskGroupEntry.fromJson(data as Map<String, dynamic>);
}

Future<void> deleteGroup(String id) async => _client.deleteData('/api/task-groups/$id');

Future<List<TaskEntry>> listTasks({
  String? groupId,
  String? status,
  String? dueDateFrom,
  String? dueDateTo,
}) async {
  final data = await _client.getData('/api/tasks', query: {
    'page': 1,
    'pageSize': 50,
    if (groupId != null) 'groupId': groupId,
    if (status != null) 'status': status,
    if (dueDateFrom != null) 'dueDateFrom': dueDateFrom,
    if (dueDateTo != null) 'dueDateTo': dueDateTo,
  });
  return unwrapItems(data).map((e) => TaskEntry.fromJson(e as Map<String, dynamic>)).toList();
}

Future<TaskEntry> createTask({required String title, required String groupId, String? dueDate}) async {
  final data = await _client.postData('/api/tasks', body: {
    'title': title,
    'groupId': groupId,
    if (dueDate != null) 'dueDate': dueDate,
  });
  return TaskEntry.fromJson(data as Map<String, dynamic>);
}

/// [dueDate] 显式传 null = 清除截止日期；不传 = 保持不变。
Future<TaskEntry> updateTask(
  String id, {
  String? title,
  String? groupId,
  String? status,
  String? dueDate,
  bool clearDueDate = false,
}) async {
  final data = await _client.putData('/api/tasks/$id', body: {
    if (title != null) 'title': title,
    if (groupId != null) 'groupId': groupId,
    if (status != null) 'status': status,
    if (clearDueDate) 'dueDate': null,
    if (!clearDueDate && dueDate != null) 'dueDate': dueDate,
  });
  return TaskEntry.fromJson(data as Map<String, dynamic>);
}

Future<void> deleteTask(String id) async => _client.deleteData('/api/tasks/$id');

/// 轻量取某组未完成数：pageSize=1 读 total（组卡片徽标用）。
Future<int> countByGroup(String groupId) async {
  final data = await _client.getData('/api/tasks',
      query: {'groupId': groupId, 'status': 'todo', 'page': 1, 'pageSize': 1});
  return (data as Map<String, dynamic>)['total'] as int;
}
```

- [ ] **Step 6: Verify**

Run: `cd apps/mobile && flutter analyze && flutter test test/features/task/task_time_test.dart`
Expected: no analyzer issues; tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/lib/features/task/ apps/mobile/test/features/task/
git commit -m "feat: add task models, API client, and date helpers for mobile"
```

---

### Task 8: Flutter — providers and actions

**Files:**
- Modify: `apps/mobile/lib/features/task/task_providers.dart`

**Interfaces:**
- Consumes: `TaskApi` methods from Task 7, `task_time.dart` helpers.
- Produces:
  - `taskGroupsProvider = FutureProvider<List<TaskGroupEntry>>`
  - `taskTodoCountProvider = FutureProvider<int>` (badge; wraps existing `countUncompleted`)
  - `taskTodayProvider = FutureProvider<List<TaskEntry>>` (status=todo, dueDateTo=today)
  - `taskWeekProvider = FutureProvider<List<TaskEntry>>`, `taskMonthProvider` (ranges via `weekRange`/`monthRange`)
  - `groupTasksProvider = FutureProvider.family<List<TaskEntry>, String>` (all statuses, by groupId)
  - `groupTodoCountProvider = FutureProvider.family<int, String>` (pageSize=1 count query)
  - `taskActionsProvider = Provider<TaskActions>` — `createGroup/renameGroup/deleteGroup/createTask/updateTask(toggle done)/deleteTask`; every write invalidates the affected providers.

- [ ] **Step 1: Implement `task_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'task_api.dart';
import 'task_models.dart';
import 'task_time.dart';

final taskApiProvider = Provider<TaskApi>((ref) => TaskApi(ref.watch(apiClientProvider)));

final taskGroupsProvider = FutureProvider<List<TaskGroupEntry>>((ref) async {
  return ref.watch(taskApiProvider).listGroups();
});

/// 抽屉 badge 用的未完成任务总数。
final taskTodoCountProvider = FutureProvider<int>((ref) async {
  return ref.watch(taskApiProvider).countUncompleted();
});

final taskTodayProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final api = ref.watch(taskApiProvider);
  final items = await api.listTasks(status: 'todo', dueDateTo: todayStr());
  return items..sort((a, b) => (a.dueDate ?? '').compareTo(b.dueDate ?? ''));
});

final taskWeekProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final (from, to) = weekRange();
  return ref.watch(taskApiProvider).listTasks(status: 'todo', dueDateFrom: from, dueDateTo: to);
});

final taskMonthProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final (from, to) = monthRange();
  return ref.watch(taskApiProvider).listTasks(status: 'todo', dueDateFrom: from, dueDateTo: to);
});

final groupTasksProvider = FutureProvider.family<List<TaskEntry>, String>((ref, groupId) async {
  return ref.watch(taskApiProvider).listTasks(groupId: groupId);
});

/// 每个任务组卡片上的「未完成任务数」。
final groupTodoCountProvider = FutureProvider.family<int, String>((ref, groupId) async {
  final data = await ref.watch(taskApiProvider).countByGroup(groupId);
  return data;
});

/// 写操作集中处：成功后 invalidate 对应 provider。
class TaskActions {
  TaskActions(this._ref);

  final Ref _ref;
  TaskApi get _api => _ref.read(taskApiProvider);

  Future<TaskGroupEntry> createGroup(String title) async {
    final g = await _api.createGroup(title);
    _ref.invalidate(taskGroupsProvider);
    return g;
  }

  Future<TaskGroupEntry> renameGroup(String id, String title) async {
    final g = await _api.updateGroup(id, title);
    _ref.invalidate(taskGroupsProvider);
    return g;
  }

  Future<void> deleteGroup(String id) async {
    await _api.deleteGroup(id);
    _ref.invalidate(taskGroupsProvider);
  }

  Future<TaskEntry> createTask({
    required String title,
    required String groupId,
    String? dueDate,
  }) async {
    final t = await _api.createTask(title: title, groupId: groupId, dueDate: dueDate);
    _invalidateAll();
    return t;
  }

  Future<TaskEntry> updateTask(
    String id, {
    String? title,
    String? groupId,
    String? status,
    String? dueDate,
    bool clearDueDate = false,
  }) async {
    final t = await _api.updateTask(id,
        title: title, groupId: groupId, status: status, dueDate: dueDate, clearDueDate: clearDueDate);
    _invalidateAll();
    return t;
  }

  Future<void> toggleDone(String id, bool done) async {
    await _api.updateTask(id, status: done ? 'done' : 'todo');
    _invalidateAll();
  }

  Future<void> deleteTask(String id) async {
    await _api.deleteTask(id);
    _invalidateAll();
  }

  void _invalidateAll() {
    _ref.invalidate(taskGroupsProvider);
    _ref.invalidate(taskTodayProvider);
    _ref.invalidate(taskWeekProvider);
    _ref.invalidate(taskMonthProvider);
    _ref.invalidate(taskTodoCountProvider);
  }
}

final taskActionsProvider = Provider<TaskActions>((ref) => TaskActions(ref));
```

Note: `countByGroup` needs adding to `TaskApi` (Task 7 companion): `Future<int> countByGroup(String groupId)` = `GET /api/tasks?groupId=…&status=todo&page=1&pageSize=1` → read `total`. Add it in Task 7 Step 5 as well (same pattern as `countUncompleted`).

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && flutter analyze`
Expected: no issues.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/features/task/task_providers.dart apps/mobile/lib/features/task/task_api.dart
git commit -m "feat: add task providers and write actions for mobile"
```

---

### Task 9: Flutter — TaskPage with 4-tab bottom navigation + 任务组 tab

**Files:**
- Create: `apps/mobile/lib/features/task/task_page.dart`
- Create: `apps/mobile/lib/features/task/task_group_list_view.dart`
- Create: `apps/mobile/lib/features/task/widgets/task_tile.dart`

**Interfaces:**
- Consumes: providers from Task 8; `showTaskEditSheet` from Task 10 (import path `task_edit_sheet.dart`); `showGroupDialog` helpers from Task 10.
- Produces: `TaskPage` (ConsumerStatefulWidget, no required args) — nested Scaffold with `NavigationBar` (任务组/今日/本周/本月) + `IndexedStack` + tab-dependent FAB; `TaskGroupListView` (ConsumerWidget, callback `onCreateGroup`).

- [ ] **Step 1: Implement `task_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'task_due_list_view.dart';
import 'task_group_list_view.dart';
import 'task_time.dart';

/// 任务模块主页面：外层 AppShell 提供 AppBar + 抽屉，本页自带底部悬浮
/// NavigationBar（任务组 / 今日 / 本周 / 本月）。IndexedStack 保持各 tab 状态。
class TaskPage extends ConsumerStatefulWidget {
  const TaskPage({super.key});

  @override
  ConsumerState<TaskPage> createState() => _TaskPageState();
}

class _TaskPageState extends ConsumerState<TaskPage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      TaskGroupListView(onCreateGroup: () => showTaskEditSheet(context)),
      TaskDueListView(kind: TaskDueKind.today),
      TaskDueListView(kind: TaskDueKind.week),
      TaskDueListView(kind: TaskDueKind.month),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _onFabPressed(),
        child: Icon(_index == 0 ? Icons.create_new_folder_outlined : Icons.add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: '任务组'),
          NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: '今日'),
          NavigationDestination(icon: Icon(Icons.calendar_view_week_outlined), selectedIcon: Icon(Icons.calendar_view_week), label: '本周'),
          NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: '本月'),
        ],
      ),
    );
  }

  void _onFabPressed() {
    if (_index == 0) {
      showTaskEditSheet(context);
    } else {
      final preset = switch (_index) {
        1 => todayStr(),
        2 => weekRange().$1,
        _ => monthRange().$1,
      };
      showTaskEditSheet(context, presetDueDate: preset);
    }
  }
}
```

(`showTaskEditSheet` is defined in `task_edit_sheet.dart`; `TaskDueListView` + `TaskDueKind` in `task_due_list_view.dart` — see Task 10.)

- [ ] **Step 2: Implement `widgets/task_tile.dart`**

```dart
import 'package:flutter/material.dart';
import '../task_models.dart';
import '../task_time.dart';

/// 任务条目：勾选圈 + 标题 + 组名/截止徽标；done 划线。
class TaskTile extends StatelessWidget {
  const TaskTile({
    super.key,
    required this.task,
    required this.groupTitle,
    this.onToggle,
    this.onTap,
    this.showOverdue = false,
  });

  final TaskEntry task;
  final String groupTitle;
  final VoidCallback? onToggle;
  final VoidCallback? onTap;
  final bool showOverdue;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final done = task.status == 'done';
    final overdue = showOverdue && task.dueDate != null && task.dueDate! < todayStr();
    return ListTile(
      onTap: onTap,
      leading: InkWell(
        onTap: onToggle,
        borderRadius: BorderRadius.circular(20),
        child: Icon(
          done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: done ? scheme.primary : scheme.outline,
        ),
      ),
      title: Text(
        task.title,
        style: done
            ? TextStyle(decoration: TextDecoration.lineThrough, color: scheme.outline)
            : null,
      ),
      subtitle: Text(groupTitle, style: TextStyle(fontSize: 12, color: scheme.outline)),
      trailing: task.dueDate == null
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: overdue ? scheme.errorContainer : scheme.secondaryContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                dueDateLabel(task.dueDate!),
                style: TextStyle(
                  fontSize: 12,
                  color: overdue ? scheme.onErrorContainer : scheme.onSecondaryContainer,
                ),
              ),
            ),
    );
  }
}
```

- [ ] **Step 3: Implement `task_group_list_view.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_providers.dart';

/// Tab 1 任务组：组卡片列表（组名 + 未完成数），点击进组详情。
class TaskGroupListView extends ConsumerWidget {
  const TaskGroupListView({super.key, required this.onCreateGroup});

  final VoidCallback onCreateGroup;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(taskGroupsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(taskGroupsProvider.future),
      child: groups.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(error: err, onRetry: () => ref.invalidate(taskGroupsProvider)),
        data: (items) {
          if (items.isEmpty) {
            return ListView(children: [ListTile(title: Text('还没有任务组，点右下角新建'))]);
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: 16, endIndent: 16),
            itemBuilder: (context, index) {
              final g = items[index];
              final count = ref.watch(groupTodoCountProvider(g.id));
              return ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: Text(g.title),
                trailing: count.when(
                  data: (n) => n > 0 ? Text('$n 项待办') : const Text(''),
                  loading: () => const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  error: (_, _) => const Text(''),
                ),
                onTap: () => context.push('/task/groups/${g.id}'),
              );
            },
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 4: Verify**

Run: `cd apps/mobile && flutter analyze`
Expected: no issues. (`task_due_list_view.dart` is created in Task 10 — if the analyzer complains about the missing import, create an empty stub file `task_due_list_view.dart` containing the `enum TaskDueKind { today, week, month }` declaration first, then Task 10 fills in the widget.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/features/task/task_page.dart apps/mobile/lib/features/task/task_group_list_view.dart apps/mobile/lib/features/task/widgets/task_tile.dart
git commit -m "feat: add mobile task page with bottom tab bar"
```

---

### Task 10: Flutter — due date views (今日/本周/本月) + edit sheet + group dialogs

**Files:**
- Create: `apps/mobile/lib/features/task/task_due_list_view.dart`
- Create: `apps/mobile/lib/features/task/task_edit_sheet.dart`
- Modify: `apps/mobile/lib/features/task/task_providers.dart` (adds `groupTitleProvider`)

**Interfaces:**
- Consumes: `taskTodayProvider`/`taskWeekProvider`/`taskMonthProvider`, `taskGroupsProvider`, `taskActionsProvider`, `TaskTile`, `todayStr()`, `dueDateLabel()`.
- Produces: `enum TaskDueKind { today, week, month }` + `TaskDueListView({required TaskDueKind kind})` (both public, used by TaskPage in Task 9); top-level `showTaskEditSheet(BuildContext, {TaskEntry? task, String? groupId, String? presetDueDate})`; `showGroupNameDialog(BuildContext, {String? initial}) -> Future<String?>` (also used by group rename).

- [ ] **Step 1: Implement `task_due_list_view.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_edit_sheet.dart';
import 'task_models.dart';
import 'task_providers.dart';
import 'task_time.dart';
import 'widgets/task_tile.dart';

enum TaskDueKind { today, week, month }

/// 今日 / 本周 / 本月 视图：只显示未完成任务。
/// 今日 tab 拆「已过期」与「今天」两组；周/月为单列表。
class TaskDueListView extends ConsumerWidget {
  const TaskDueListView({super.key, required this.kind});

  final _DueKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = switch (kind) {
      TaskDueKind.today => taskTodayProvider,
      TaskDueKind.week => taskWeekProvider,
      TaskDueKind.month => taskMonthProvider,
    };
    final tasks = ref.watch(provider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(provider.future),
      child: tasks.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(error: err, onRetry: () => ref.invalidate(provider)),
        data: (items) {
          if (items.isEmpty) {
            return ListView(children: const [ListTile(title: Text('这段时间没有待办任务'))]);
          }
          return ListView(
            children: [
              if (kind == TaskDueKind.today) ...[
                _sectionHeader(context, '已过期'),
                for (final t in items.where((t) => t.dueDate != null && t.dueDate! < todayStr()))
                  _tile(ref, context, t, showOverdue: true),
                _sectionHeader(context, '今天'),
                for (final t in items.where((t) => t.dueDate != null && t.dueDate! >= todayStr()))
                  _tile(ref, context, t),
              ] else
                for (final t in items) _tile(ref, context, t),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String label) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: scheme.primary)),
    );
  }

  Widget _tile(WidgetRef ref, BuildContext context, TaskEntry t, {bool showOverdue = false}) {
    final groupTitle = ref.watch(groupTitleProvider(t.groupId)).value ?? '';
    return TaskTile(
      task: t,
      groupTitle: groupTitle,
      showOverdue: showOverdue,
      onToggle: () => ref.read(taskActionsProvider).toggleDone(t.id, t.status != 'done'),
      onTap: () => showTaskEditSheet(context, task: t),
    );
  }
}
```

(`groupTitleProvider` lives in `task_providers.dart` — `FutureProvider.family<String, String>` resolving a groupId → title from `taskGroupsProvider`, fallback `''`:

```dart
final groupTitleProvider = FutureProvider.family<String, String>((ref, groupId) async {
  final groups = await ref.watch(taskGroupsProvider.future);
  return groups.where((g) => g.id == groupId).map((g) => g.title).firstOrNull ?? '';
});
```)

- [ ] **Step 2: Implement `task_edit_sheet.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../task_models.dart';
import '../task_providers.dart';
import '../task_time.dart';

/// 打开任务创建/编辑底部弹窗。
/// [task] 为空 = 新建；[groupId] 预设所属组；[presetDueDate] 预设截止日期（日期 tab 新建时预填）。
Future<void> showTaskEditSheet(
  BuildContext context, {
  TaskEntry? task,
  String? groupId,
  String? presetDueDate,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _TaskEditSheet(task: task, initialGroupId: groupId, presetDueDate: presetDueDate),
    ),
  );
}

class _TaskEditSheet extends ConsumerStatefulWidget {
  const _TaskEditSheet({this.task, this.initialGroupId, this.presetDueDate});

  final TaskEntry? task;
  final String? initialGroupId;
  final String? presetDueDate;

  @override
  ConsumerState<_TaskEditSheet> createState() => _TaskEditSheetState();
}

class _TaskEditSheetState extends ConsumerState<_TaskEditSheet> {
  late final TextEditingController _title = TextEditingController(text: widget.task?.title ?? '');
  String? _groupId;
  String? _dueDate;
  String _status = 'todo';
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _groupId = widget.task?.groupId ?? widget.initialGroupId;
    _dueDate = widget.task?.dueDate ?? widget.presetDueDate;
    _status = widget.task?.status ?? 'todo';
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(taskGroupsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.task == null ? '新建任务' : '编辑任务', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: '标题', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            const SizedBox(height: 8),
            groups.when(
              loading: () => const LinearProgressIndicator(),
              error: (err, _) => Text(humanizeError(err)),
              data: (list) {
                if (list.isEmpty) {
                  return const Text('请先创建任务组');
                }
                return DropdownButtonFormField<String>(
                  initialValue: _groupId != null && list.any((g) => g.id == _groupId)
                      ? _groupId
                      : list.first.id,
                  decoration: const InputDecoration(labelText: '所属任务组'),
                  items: [for (final g in list) DropdownMenuItem(value: g.id, child: Text(g.title))],
                  onChanged: (v) => setState(() => _groupId = v),
                );
              },
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(_dueDate == null ? '截止日期' : dueDateLabel(_dueDate!)),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_dueDate != null)
                    IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _dueDate = null)),
                  const Icon(Icons.chevron_right),
                ],
              ),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _dueDate != null ? DateTime.parse(_dueDate!) : DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                );
                if (picked != null) setState(() => _dueDate = dateStr(picked));
              },
            ),
            if (widget.task != null)
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: '状态'),
                items: const [
                  DropdownMenuItem(value: 'todo', child: Text('待办')),
                  DropdownMenuItem(value: 'done', child: Text('已完成')),
                  DropdownMenuItem(value: 'abandon', child: Text('已放弃')),
                ],
                onChanged: (v) => setState(() => _status = v ?? 'todo'),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(widget.task == null ? '创建' : '保存'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请输入任务标题')));
      return;
    }
    final actions = ref.read(taskActionsProvider);
    setState(() => _submitting = true);
    try {
      final groupId = _groupId;
      if (groupId == null) throw Exception('未选择任务组');
      if (widget.task == null) {
        await actions.createTask(title: title, groupId: groupId, dueDate: _dueDate);
      } else {
        await actions.updateTask(widget.task!.id,
            title: title, status: _status, dueDate: _dueDate, clearDueDate: _dueDate == null && widget.task!.dueDate != null);
      }
      if (!context.mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!context.mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }
}

/// 任务组新建/改名对话框，返回新标题或 null（取消）。
Future<String?> showGroupNameDialog(BuildContext context, {String? initial}) {
  final controller = TextEditingController(text: initial ?? '');
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(initial == null ? '新建任务组' : '重命名任务组'),
      content: TextField(controller: controller, autofocus: true, maxLength: 200),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () {
            final v = controller.text.trim();
            if (v.isNotEmpty) Navigator.of(ctx).pop(v);
          },
          child: const Text('确定'),
        ),
      ],
    ),
  );
}
```

- [ ] **Step 3: Wire group create/rename/delete into `task_group_list_view.dart`**

Update Task 9's `TaskGroupListView` so the FAB callback and item menu work:

```dart
// FAB (from TaskPage) for tab 0 → showGroupNameDialog → actions.createGroup
// Item long-press / trailing popup menu (rename / delete with confirm):
//   showDialog 确认删除（「删除任务组会一并删除组内任务」），再 actions.deleteGroup(id)
```

Concretely: in `TaskGroupListView`, wrap each `ListTile` with a `PopupMenuButton` as `trailing` is occupied by the count — use `onLongPress` on the tile to show a `showModalBottomSheet` with 重命名/删除 actions. Implement:

```dart
onLongPress: () async {
  final action = await showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(title: Text(g.title), dense: true),
        const Divider(height: 1),
        ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('重命名'), onTap: () => Navigator.of(ctx).pop('rename')),
        ListTile(leading: const Icon(Icons.delete_outline), title: const Text('删除'), onTap: () => Navigator.of(ctx).pop('delete')),
      ]),
    ),
  );
  if (action == 'rename') {
    final title = await showGroupNameDialog(context, initial: g.title);
    if (title != null) await ref.read(taskActionsProvider).renameGroup(g.id, title);
  } else if (action == 'delete') {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除任务组'),
        content: Text('确定删除「${g.title}」？组内任务会一并删除，不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('删除')),
        ],
      ),
    );
    if (ok == true) await ref.read(taskActionsProvider).deleteGroup(g.id);
  }
},
```

- [ ] **Step 4: Verify**

Run: `cd apps/mobile && flutter analyze`
Expected: no issues.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/features/task/task_due_list_view.dart apps/mobile/lib/features/task/task_edit_sheet.dart apps/mobile/lib/features/task/task_group_list_view.dart apps/mobile/lib/features/task/task_providers.dart
git commit -m "feat: add mobile task due-date views and create/edit sheets"
```

---

### Task 11: Flutter — task group detail page

**Files:**
- Create: `apps/mobile/lib/features/task/task_group_detail_page.dart`

**Interfaces:**
- Consumes: `groupTasksProvider(groupId)`, `taskGroupsProvider` (for title), `taskActionsProvider`, `TaskTile`, `showTaskEditSheet`.
- Produces: `TaskGroupDetailPage({required String groupId})` — full-screen page (own Scaffold + AppBar with back), all statuses, done struck through, FAB to create a task in this group.

- [ ] **Step 1: Implement**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_edit_sheet.dart';
import 'task_providers.dart';
import 'task_time.dart';
import 'widgets/task_tile.dart';

/// 任务组详情：组内全部任务（含已完成/已放弃），点条目编辑，勾选切换完成。
class TaskGroupDetailPage extends ConsumerWidget {
  const TaskGroupDetailPage({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(groupTasksProvider(groupId));
    final groupTitle = ref.watch(taskGroupsProvider).value
        ?.where((g) => g.id == groupId)
        .map((g) => g.title)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(groupTitle ?? '任务组')),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await showTaskEditSheet(context, groupId: groupId);
          if (context.mounted) ref.invalidate(groupTasksProvider(groupId));
        },
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(groupTasksProvider(groupId).future),
        child: tasks.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(error: err, onRetry: () => ref.invalidate(groupTasksProvider(groupId))),
          data: (items) {
            if (items.isEmpty) {
              return ListView(children: const [ListTile(title: Text('这个任务组还没有任务'))]);
            }
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, indent: 16, endIndent: 16),
              itemBuilder: (context, index) {
                final t = items[index];
                return TaskTile(
                  task: t,
                  groupTitle: '',
                  showOverdue: t.status == 'todo',
                  onToggle: () {
                    ref.read(taskActionsProvider).toggleDone(t.id, t.status != 'done');
                    ref.invalidate(groupTasksProvider(groupId)); // 家族 provider 不走全局 invalidate
                  },
                  onTap: () async {
                    await showTaskEditSheet(context, task: t);
                    if (context.mounted) ref.invalidate(groupTasksProvider(groupId));
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && flutter analyze`
Expected: no issues.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/features/task/task_group_detail_page.dart
git commit -m "feat: add mobile task group detail page"
```

---

### Task 12: Flutter — router + drawer badge

**Files:**
- Modify: `apps/mobile/lib/router.dart`
- Modify: `apps/mobile/lib/app_shell.dart`

**Interfaces:**
- Consumes: `TaskPage`, `TaskGroupDetailPage`, `taskTodoCountProvider`.
- Produces: `/task` → `TaskPage` (inside ShellRoute); `/task/groups/:id` → `TaskGroupDetailPage` (top-level, like `/moments/:id`); drawer `/task` badge shows real uncompleted count.

- [ ] **Step 1: Update router**

```dart
// replace the placeholder route:
GoRoute(path: '/task', builder: (context, state) => const TaskPage()),
// add top-level (outside ShellRoute, alongside /moments/:id):
GoRoute(
  path: '/task/groups/:id',
  builder: (context, state) => TaskGroupDetailPage(groupId: state.pathParameters['id']!),
),
// imports: features/task/task_page.dart, features/task/task_group_detail_page.dart
```

- [ ] **Step 2: Update AppShell badge**

```dart
// import 'features/task/task_providers.dart';
final taskTodo = ref.watch(taskTodoCountProvider);
// badgeFor switch case:
'/task' => taskTodo.hasValue && taskTodo.value! > 0 ? '${taskTodo.value}' : null,
```

- [ ] **Step 3: Verify**

Run: `cd apps/mobile && flutter analyze && flutter test`
Expected: no issues; existing widget/router tests still pass (they may snapshot the placeholder — update any test expectations that referenced `PlaceholderPage` at `/task`).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/router.dart apps/mobile/lib/app_shell.dart
git commit -m "feat: wire task routes and drawer badge on mobile"
```

---

### Task 13: Cross-subsystem verification + project memory

**Files:**
- Verify: all four packages; run the full suites below.
- Write: `.ai/worklog/2026-08-09-task-module-mobile-dueDate.md` (via remember-worklog skill); update `.ai/requirements/2026-08-05-task-module.md` status to note mobile + dueDate.

- [ ] **Step 1: Run all suites**

```bash
cd services/api && bun run typecheck && bun test            # API unit
cd apps/cli && go build ./... && go vet ./... && go test -count=1 ./...   # CLI
cd services/mcp && bun run typecheck                        # MCP
cd apps/mobile && flutter analyze && flutter test           # Flutter
bun test                                                    # root (MCP tests)
```

- [ ] **Step 2: Manual smoke on simulator**

Build & run `apps/mobile` on an iOS simulator / Android emulator against the local API (see `.ai/runbooks` for device setup). Verify:
1. `/task` shows the 4-tab bottom bar; drawer still works.
2. 任务组 tab: create group → card appears with count; long-press → rename/delete.
3. Group detail: create task with/without due date; toggle done (strikethrough); edit sheet shows 状态; delete confirms.
4. 今日 tab: create a task with dueDate=today → appears under 今天; create one dated yesterday → appears under 已过期 (red badge); complete it → disappears.
5. 本周/本月 tabs: tasks due in range appear; dueDate badge shows 今天/明天/M月d日.
6. Drawer badge for 任务 shows the real todo count.
7. CLI round-trip: `serenique task create --due-date 2026-08-09 …` then `serenique task list --due-from 2026-08-01 --due-to 2026-08-31` shows the task.

- [ ] **Step 3: Write project memory**

Use the remember-worklog skill: record what was built, verification results, and pitfalls (e.g. the `date`-column timezone off-by-one trap that drove the `text` column decision; `DropdownButtonFormField` `initialValue`; nested-Scaffold NavigationBar pattern). Update the task requirement doc status. Commit:

```bash
git add .ai/
git commit -m "docs: record task module mobile implementation"
```

---

## Self-Review Notes

- **Spec coverage:** dueDate field (Tasks 1-3) · CLI sync (5-6) · MCP sync (4) · TaskPage 4 tabs (9) · group detail (11) · today/week/month views + overdue split (10) · CRUD (8-11) · badge real count (12) · date decisions (Global Constraints) — all covered.
- **Cross-task names:** `showTaskEditSheet`/`TaskDueKind`/`TaskDueListView` are public in Task 10 and used by Task 9; `groupTitleProvider` added to `task_providers.dart` in Task 10; `countByGroup` defined in Task 7 and consumed by `groupTodoCountProvider` in Task 8. Keep these names stable across tasks.
