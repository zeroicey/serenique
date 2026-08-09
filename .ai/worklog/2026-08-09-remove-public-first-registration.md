# 2026-08-09 — 移除公开首次注册：引导脚本 + 启动 fail-closed + 门禁改凭证计数

按 `.ai/requirements/2026-08-09-passkey-auth.md` 决策⑨（配合⑦）落地：users 行改由引导脚本 `scripts/bootstrap-user.ts` 创建，register/start|finish 不再建用户；注册门禁从「users 计数」改为「凭证计数」；auth 启用时 users 空表 → 启动 fail-closed。

## 改动清单

**`src/modules/auth/auth.domain.ts`**
- `evaluateRegisterGate`：`userCount` → `credentialCount`（凭证 0 = 引导期，SETUP_TOKEN 常量时间比对；≥1 = 需登录会话加设备；错误文案/状态码不变：403/401/500）
- 新增 `evaluateSeedGate(userCount)` 纯函数：users 空表 → 返回中文提示（指明 `bun scripts/bootstrap-user.ts` 与 `docker compose run --rm api` 两种执行方式）；否则 ok

**`src/modules/auth/auth.types.ts`**：`RegisterStartSchema` 移除 `userInfo` 字段（保留 `setupToken?`）；删除 `RegisterUserInfo` 类型

**`src/modules/auth/auth.service.ts`**
- `StoredChallenge`：去掉 `userInfo`，加 `mode: "first-time" | "authenticated"`（决定审计/响应文案）
- `evaluateGate`：改查 `passkey_credentials` 计数
- `registerStart`：不再生成随机 userId——两种模式都取现有单用户行（`getFirstUser`/`getProfile`），options.user.name/displayName 取 users.name，缺省回退 `serenique-user`/`Serenique 用户`；users 行缺失（引导脚本没跑）→ 500 带脚本提示
- `registerFinish`：删除 INSERT users 分支，凭证直接挂到记录的用户行（行缺失 → 404 带脚本提示）；返回 `{ user, mode }`（去掉 isFirstUser）
- 新增 `assertUsersSeeded()`：`isAuthEnabled()` 且 users 计数 0 → 抛 AppError(INTERNAL, 500) 带引导脚本提示；dev 跳过

**`src/modules/auth/auth.handler.ts`**：registerFinish 响应文案按 `mode` 区分（注册成功/登录凭证添加成功），数据载荷固定 `{ authenticated, user }`

**`src/index.ts`**：`initBlobRoot` 后、`createApp` 前加 `await authService.assertUsersSeeded()`——只走真实启动路径，测试 app（`createApp`）不连 DB 不受影响

**`scripts/bootstrap-user.ts`（新）**：见下节

**`tsconfig.json`**：include 加 `scripts/**/*.ts`（脚本纳入 typecheck；`@/*` 别名 bun/tsc 均按 services/api/tsconfig.json 解析，实测正常）

**测试**：`auth.domain.test.ts`（门禁改 credentialCount 语义 + 新增 evaluateSeedGate 用例）、`auth.service.integration.test.ts`（beforeAll 清空 users 全表后预置 marker 用户行模拟引导脚本产物；注册请求不再带 userInfo；断言 options.user 取现有行；新增「users 空表 → assertUsersSeeded 抛错」末位用例）

**文档**：AGENTS.md（Auth 节改凭证计数门禁 + 引导脚本 + fail-closed、路由表去 userInfo、Docker 节补 compose run 提示）、`.env.example`（SETUP_TOKEN 注释改凭证语义 + FIRST_USER_*）、`env.ts` 注释同步

## 引导脚本要点

- 幂等：users 已有行 → 打印 id/名称并 exit 0（实测两次运行验证）
- 参数 `--name/--email/--birthday` 优先于 env `FIRST_USER_NAME/EMAIL/BIRTHDAY`；全空 → 插入空行；birthday 校验 YYYY-MM-DD + 真实日期（非法 → 中文报错 exit 1）
- **只依赖 DATABASE_URL**：不 import `@/env`（完整 env 校验会因缺 SESSION_SECRET/BLOB_ROOT 崩溃）；`db/connection.ts` 也 import `@/env`，所以脚本自建 `postgres` 客户端 + drizzle（schema 只取 `@/modules/auth/auth.schema`，纯表定义无 env 依赖）
- 输出：创建成功/已存在 + 用户 id + 「打开 https://<WEBAUTHN_RP_ID>/setup?setupToken=<SETUP_TOKEN> 创建首个通行密钥」（SETUP_TOKEN 未配置时输出占位提示）
- 镜像内可用：Dockerfile `COPY --chown=10001:10001 services/api/ services/api/` 整目录拷贝，`.dockerignore` 不排除 scripts/ → **无需改 Dockerfile**；WORKDIR /app/services/api 下 `@/*` 解析到镜像内 src/

## 验证

- `bun run typecheck` 通过（含脚本）
- `bun test` 单测：155 pass / 115 skip / 0 fail
- `RUN_DB_TESTS=1 bun test` 集成：97 pass / 0 fail（合计 252 tests 全绿）
- 实测脚本：起测试 DB 跑 `bun scripts/bootstrap-user.ts --name 本地实测 ...` 创建成功；第二次运行打印「用户已存在」exit 0；`--birthday 1990-13-01` → 中文报错 exit 1；测后清理 users 行

## 对 Web 端契约影响（Web agent 必读）

1. **`POST /api/auth/register/start` 请求体变化**：`userInfo` 字段移除，只接受 `{ setupToken? }`（多余字段 Zod 默认剥离，不会报错）。ceremony options 的 `user.id/name/displayName` 现在取引导脚本创建的单用户行（不再由请求体提供）
2. **403 语义变化**：不再是「users 空表 + 错误 SETUP_TOKEN」→ 现在是「凭证计数 0 + 错误 SETUP_TOKEN」。users 已存在但凭证为 0 时照样是引导期（需 SETUP_TOKEN）
3. **新 500**：users 行不存在（引导脚本未跑）时 register/start|finish → 500/404，message 指明先跑引导脚本
4. **启动 fail-closed**：生产 auth 启用 + users 空表 → API 拒绝启动，先 `bun scripts/bootstrap-user.ts`
5. register/finish 响应仍为 `{ authenticated, user }`，无字段变化

## 坑 / 对下一次会话的提示

1. **`docker compose run` 覆盖 CMD**：entrypoint 的 localhost→host.docker.internal 重写不会执行，容器内跑引导脚本必须传 host 可达的 DATABASE_URL（AGENTS.md Docker 节已注明；部署侧 compose 若定义了 entrypoint 则无此问题）
2. **db/connection.ts 依赖完整 @/env**：BLOB_ROOT 是必填项，任何「只给 DATABASE_URL」的独立脚本都不能 import 它——引导脚本自建客户端 + 只 import `auth.schema.ts`（纯表定义）。将来若再有 CLI 脚本照此办理
3. **集成测试 users 表单行语义**：auth 集成测试 beforeAll 现在 `db.delete(users)` 清全表再预置 marker 行——任何并行/残留用户行都会被清掉，比之前按 name marker 清理更稳；前提是其他集成测试不创建用户行（audit 集成测试已确认不建）
4. **脚本不在 tsconfig include 时 typecheck 不覆盖**：已加 `scripts/**/*.ts`；若脚本未来依赖 node 内置外的包，注意镜像内只有生产依赖（devDependencies 无）
5. **`options.user.name` 与 displayName 的取值**：registerStart 里引导期和加设备两条路径现在共用同一套回退逻辑（`users.name ?? serenique-user / Serenique 用户`），之前的双路径写法已删
