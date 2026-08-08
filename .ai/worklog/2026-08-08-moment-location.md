# 2026-08-08 — Moment 位置信息（微信朋友圈式，API + CLI）

用户要求给 moment 加微信朋友圈式的位置功能：前端可选地获取并选择附近位置，后端只存一个通用字段。兼容性要求：功能可选，任一客户端未更新也能正常使用（旧客户端不传位置 = null）。

## 改动（commit 待提交）

- **API（services/api/src/modules/moment/）**：
  - `moment.schema.ts`：`moments` 表新增 `location jsonb`（nullable，`$type<MomentLocation | null>`）
  - `moment.types.ts`：新增 `MomentLocationSchema`（name ≤128 / latitude -90..90 / longitude -180..180，均可选，至少一个字段）；`CreateMomentSchema` + `location?`；`UpdateMomentSchema` 三态（缺省=不变 / null=清除 / 对象=覆盖）；`MomentEntry` + `location`
  - `moment.mappers.ts` / `moment.service.ts`：透传（update 的 spread 依赖 drizzle `mapUpdateSet` 过滤 undefined，天然支持三态，无需改）
  - `exports.ts`：导出 `MomentLocation` + `MomentLocationSchema`
  - 迁移 `drizzle/0011_strange_maggott.sql`：`ALTER TABLE "moments" ADD COLUMN "location" jsonb`
- **CLI（apps/cli）**：
  - `internal/client/moment.go`：`MomentLocation` 结构体 + `MomentEntry.Location`（指针，null/缺失→nil）；`UpdateMoment` 改为 `UpdateMomentInput{Text, Location, ClearLocation}`（破坏性签名变更，唯一调用方 moment edit 已同步）
  - `cmd/moment.go`：`moment create --location/--lat/--lng`；`moment edit --location/--lat/--lng/--no-location`（--no-location 与位置参数互斥校验）；get/list 表格加「位置」列（`formatMomentLocation`：name 优先，无 name 显示坐标，无位置显示 `-`）
- **MCP 不改**：`.ai/decisions/2026-08-08-mcp-sunset.md` 已停更 MCP；且 `create_moment` 通过 `CreateMomentSchema.extend()` 自动继承新字段，无需人工改动

## 验证

- API 单测：`cd services/api && bun test src/modules/moment/` → 22 pass（含 location schema 校验、mapper 透传）
- API 集成测试：`RUN_DB_TESTS=1 bun test src/modules/moment/*.integration.test.ts` → 19 pass（含三态 update 往返）
- 根 `bun run typecheck`（api+mcp+web）通过
- CLI：`go build ./... && go vet ./... && go test -count=1 ./...` 全绿（含 client 三态 body 测试、create/edit 位置测试）
- curl 冒烟（本地 dev server，port 3002）：创建带位置 → 文本-only PUT 保留位置 → `location:null` 清除 → 列表带位置 → 非法坐标 400 VALIDATION → DELETE 204
- 注：根 `bun test` 有 61 个**既有**失败（web/REST smoke 等），stash 前后一致，与本改动无关

## 坑 / 对下一次会话的提示

- **本地 3000 端口被 docker 容器 `serenique-api-1` 占用**：本地起 dev server 做冒烟要用 `PORT=3002`，否则 curl 打到旧容器镜像（旧代码静默丢弃未知字段，表现为「location 丢了」）
- **本机 `.env` 的 AUTH_TOKEN 不足 32 字符**（dev 占位），dev server 启动需 `unset AUTH_TOKEN`（dev 模式跳过认证），否则 `env.ts` 校验 fail-closed
- **pflag `Flags().Set()` 会永久标记 flag 为 Changed**，跨 subtest 共享全局 command 会泄漏状态；测试里要在 setup 时 `Lookup("lat").Changed = false` 手动重置
- drizzle-orm 的 `mapUpdateSet` 会过滤 `undefined` 的 set 值（`value !== void 0`），「spread 整个 parsed body 到 `.set()`」天然实现三态语义，无需显式分支
