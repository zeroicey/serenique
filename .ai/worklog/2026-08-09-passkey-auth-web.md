# 2026-08-09 — Web 认证重构：Passkey (WebAuthn) 登录 + 设置页（凭证/Token 管理）

按 `.ai/requirements/2026-08-09-passkey-auth.md` 完成 Web 端 phase：登录页从「输入 token」改为 **Passkey (WebAuthn)** ceremony（`@simplewebauthn/browser`），新增设置页三 tab（个人信息 / 登录凭证 / API 令牌）。API 侧契约见 `2026-08-09-passkey-auth-api.md`，本 log 只记 Web 端。

## 改动

- **依赖**：`apps/web` 新增 `@simplewebauthn/browser@13.3.0`（与 API 的 server 13.3.x 同代；v13 API 形态是 `startRegistration({ optionsJSON })` / `startAuthentication({ optionsJSON })`，不是旧版的裸 options 参数）
- **`features/auth/api.ts`**（重写）：`fetchAuthStatus` 形状扩为 `{ authenticated, user: UserEntry | null }`（401 → `{ authenticated:false, user:null }` 语义保留）；新增 `registerStart/registerFinish/loginStart/loginFinish`（双段 ceremony）、`listCredentials/deleteCredential`、`getProfile/updateProfile`；**204 处理**：`deleteCredential` 等 204 无 body 响应不能走 `unwrap`（`response.json()` 会炸），先判 `res.status === 204`
- **`features/auth/webauthn.ts`**（新）：ceremony 编排 + 浏览器异常中文翻译（NotAllowedError→「已取消或没有可用的通行密钥」、NotSupportedError→环境不支持、SecurityError→来源不受信任、InvalidStateError→已注册过；ApiError 原样透传）
- **`features/auth/queries.ts`**（重写）：`useLogin`（登录，失败 Toast）、`useRegister`（**不弹 Toast**——登录页注册表单内联展示错误，便于指向 SETUP_TOKEN 字段）、`useLogout`、`useRegisterGate`（登录页首次注册探测）、`useCredentials/useDeleteCredential`、`useProfile/useUpdateProfile`
- **登录页**：注册门禁探测 = 无参调 `register/start`：403（users 空表）→ 直接展示注册表单（SETUP_TOKEN + 可选姓名/邮箱/生日）；401（已有用户）→ 只显示登录按钮；网络/500 → 登录 + 提示。注册成功自动登录跳 `/`
- **`features/settings/`**（新 feature）：`api.ts`（tokens CRUD，204 特判）+ `queries.ts` + `settings-page.tsx`（三 tab：个人信息表单 / 凭证列表+删+添加设备 / 令牌列表+建+撤销+**明文仅显示一次弹窗**，关闭即清内存）+ 各 section 组件；路由 `/settings` 由占位页改为真页面
- **`components/common/confirm-dialog.tsx`**（新）：通用二次确认弹窗（task 的 `TaskConfirmDialog` 同名副本未动，后续可合并）
- **测试**：`api.test.ts` 重写（含 204/409 分支）、`webauthn.test.ts`（ceremony 顺序 + 7 种错误翻译）、`login-page.test.tsx`（门禁状态驱动的 UI 分支）、`settings-page.test.tsx`（三 tab 核心交互）、`api.real.test.ts` 补 204 真边界、`App.test.tsx` mock 更新

## 验证

- `apps/web`: `bun run typecheck` ✓、`bun run test`（vitest）**155 pass / 0 fail**、`bun run build` ✓（settings 页独立分包 12 kB）
- 根 `bun run typecheck`（api + mcp + web）✓
- 联调 smoke（API 以 `WEBAUTHN_RP_ID=localhost` + `SESSION_SECRET` + `SETUP_TOKEN` 起在 3100，Vite 用临时 config 代理 `/api → 3100`，docker postgres 已含 0014 迁移）：
  - `/api/auth/me` → 401「未认证或登录已过期」（AuthGuard 跳登录页的分支）
  - `register/start` 无/错 SETUP_TOKEN → 403「引导注册令牌不正确」（登录页首次注册探测）
  - `register/start` 正确 SETUP_TOKEN → 200 `{ challengeId, options }`（rp.id=localhost，pubKeyCredParams 三算法）
  - `register/finish` 带非白名单 `Origin` → 403「请求来源不受信任」（Origin 校验在 finish 段，start 段不校验）
  - `login/start` → 200 `{ challengeId, options }`；Vite proxy 链路全通
  - 完整浏览器 ceremony 未在无头环境跑（需真实 passkey）——服务端侧已由 API 集成测试全 ceremony 覆盖，客户端编排由单测覆盖

## 坑 / 对下一次会话的提示

1. **`bun test` ≠ `bun run test`**：`apps/web` 里 `bun test` 会走 bun 自带 runner（不支持 `vi.hoisted`，40 个既有测试全红）——必须 `bun run test`（= vitest run）。
2. **`bun run build`（tsc --noEmit && vite build）是 typecheck 的超集**，但 `bun run test` 不跑 tsc；两条都要跑。
3. **204 无 body**：`Res.noContent` 的端点（删凭证/撤令牌）必须 `status === 204` 特判，`unwrap` 的 `response.json()` 会直接 reject。测试里用 `new Response(null, { status: 204 })` 复现。
4. **vitest `toEqual` 不忽略 undefined 对象属性**（与 jest 文档表述不同）：断言 `{a: undefined}` 与 `{}` 相等会失败；RHF 空串转 `undefined` 的 payload 断言按字段逐一 `toBeUndefined()`。
5. **`@simplewebauthn/browser` v13 类型**：`RegistrationResponseJSON` 的 `clientExtensionResults` 是必填；`startRegistration` 参数形态为 `{ optionsJSON, useAutoRegister? }`——测试 fixture 要按此构造。
6. **测试里 mock 顺序坑**：`renderPage` 统一设置 mock 默认值会覆盖测试内对 mutation 的定制——需要定制时走参数（`renderPage(gate, { error })`）。
7. **jsdom 里原生 `el.click()` 在 act 外不 flush** React 更新（React 19）：测试切 tab 用 `fireEvent.click` 或 `userEvent`，别用原生 click。
8. **前端域名 = RP ID**（API worklog 已提示）：本机联调 `WEBAUTHN_RP_ID=localhost` + `WEBAUTHN_ORIGINS=http://localhost:5173`（env 默认含 5173/3000）；换域名 = 旧 passkey 全失效。
