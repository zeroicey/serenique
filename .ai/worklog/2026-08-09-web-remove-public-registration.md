# 2026-08-09 — Web 移除公开首次注册：登录页只留通行密钥 + 隐藏 /setup 引导页

需求决策⑨（`.ai/requirements/2026-08-09-passkey-auth.md`）的 Web 侧实施，配合 API commit `e9e0195`（register/start 请求体仅 `{ setupToken? }`，无 userInfo；凭证计数=0 + SETUP_TOKEN 门禁；users 行缺失 500 带引导脚本提示）。提交：`5571a16`。

## 改动（`apps/web`，14 文件）

- **登录页**（`features/auth/pages/login-page.tsx` 重写）：删除注册表单组件引用、「首次使用？注册」切换、`useRegisterGate` 挂载探测。页面 = 通行密钥登录按钮 + 不支持 WebAuthn 提示；失败统一 Toast 中文文案，零注册引导。
- **`/setup` 隐藏引导页**（`features/auth/pages/setup-page.tsx` 新建 + `app/router.tsx` 注册，顶层懒加载，**不挂任何导航入口**）：
  - 无 `?setupToken=` → 「设置链接无效」；
  - 有 token → 「创建通行密钥」+ 说明 + 按钮；点击 → `register/start { setupToken }` → `startRegistration(options)` → `register/finish` → 自动登录 → 跳 `/`；
  - 401（已有凭证，引导期已过）→ 跳登录页；403（token 错）/500（未建用户）→ 内联服务端中文文案；浏览器/网络错误 → 复用 `webauthn.ts` 翻译内联展示（`role="alert"`）。
- **契约同步**：`api.ts` 删 `RegisterUserInfo`，`registerStart` 输入仅 `{ setupToken? }`；`webauthn.ts` `registerWithPasskey` 去 userInfo；`queries.ts` 删 `useRegisterGate`/`RegisterGateState`/`authKeys.registerGate`，`useRegister` 输入简化为 `{ setupToken? }`，新增 `useSetupRegister`（setupToken 必填，供 setup 页）。设置页「添加设备」调用不变（本就传 `{}`，`credentials-section.tsx` 零改动）。
- **删除** `features/auth/components/register-form.tsx`（setup 页 UI 远比表单简单，不复用）。

## 契约偏离（本任务内发现并修复，跨任务合理）

1. **`api/client.ts` 全局 `throwHttpErrors: false`**：ky 默认非 2xx 直接抛 `HTTPError`，统一 envelope 里的服务端文案与状态码到不了 `unwrap` 的 `ApiError`——真实边界下 setup 页的 403/401/500 区分（以及所有 mutation 的服务端中文错误展示）全部失效。已用真边界测试证明（改造前 403 → `HTTPError`，改造后 → `ApiError('引导注册令牌不正确', 403)`）。`fetchAuthStatus` 的逐调用 `throwHttpErrors:false` override 随之删除。
2. **`api/unwrap.ts` 加固**：非 JSON 错误体（网关 502 等）不再泄漏 `SyntaxError`，统一 `ApiError('服务暂时不可用，请稍后再试', status)`。
3. **`webauthn.ts` 网络层翻译**：`TypeError`（fetch failed）/ `TimeoutError` → 「服务暂时不可用，请稍后再试」（此前这类错误落到默认分支显示「通行密钥验证失败，请重试」，误导）。

## 测试

- `login-page.test.tsx` 重写：**不 mock queries**，页面走真实 `useLogin`（`QueryClientProvider` + sonner `Toaster`），mock 仅 `../webauthn`——错误文案的 Toast 路径是真实验证。5 用例：仅登录按钮无注册、点击登录跳主页、网络失败 Toast「服务暂时不可用」、服务端错误 Toast 透传、不支持 WebAuthn 禁用。
- `setup-page.test.tsx` 新建（mock `useSetupRegister`，`MemoryRouter` + 多路由断言跳转）：无 token 无效链接 / 有 token 创建流程 / 403 内联 / 500 引导脚本提示 / 401 跳登录 / 浏览器错误内联。
- `webauthn.test.ts`：register 用例去 userInfo；新增网络/超时翻译用例。
- `api.test.ts`：registerStart 仅 setupToken；非 2xx envelope → ApiError 带 status。
- `api.real.test.ts`（真实 ky 边界）：新增真实 403 → `ApiError`（status 透传）、真实 401、非 JSON 502 → 「服务暂时不可用」。
- 设置页测试零改动通过（mock 层不感知契约变化）。

## 验证

- `apps/web`: `bun run typecheck` ✓、`bun run test`（vitest）**167 pass / 0 fail**（基线 155 → 净增 12）、`bun run build` ✓
- 根 `bun run typecheck`（api + mcp + web）✓
- 完整浏览器 ceremony 未在无头环境跑（需真实 passkey）；服务端门禁行为由 API 集成测试覆盖，客户端分支由上述单测覆盖

## 坑 / 对下一次会话的提示

1. `bun test` 在 `apps/web` 会走 bun 自带 runner（`vi.hoisted`/`vi.mocked` 全挂，40+ 既有测试假红）——**必须 `bun run test`**（= vitest run）。与 08-09 前一份 web worklog 提示一致，是环境固有行为不是本次引入。
2. ky 默认 `throwHttpErrors:true` 会绕过 envelope 错误通道——新增端点/feature 若发现「服务端中文错误不展示」，先检查是否依赖 ky 抛错而非 `unwrap`。
3. shadcn `CardTitle` 渲染为 `div[data-slot=card-title]` 不是 heading：测试断言标题用 `document.querySelector('[data-slot="card-title"]')` 或 `getAllByText`，别用 `getByRole('heading')`。
4. sonner `Toaster` 可直接在测试里渲染，Toast 文案用 `findByText` 断言（无需 mock sonner）。
