# 修复：移动端登录失败（第三方 cookie 拦截）

- 日期：2026-08-09
- 提交：`0df303e`（+ 生产部署 digest b374d0f5…）

## 症状

电脑 Web 端 passkey 登录正常；手机扫脸后不跳转，手动跳转回到登录页，无任何报错。

## 排查过程（系统化调试）

1. **审计日志**：手机尝试期间 `auth.login` 全部成功（09:04–09:12 多笔），无 `login_failed` → 服务端验证通过。
2. **请求级日志**（docker compose logs api）钉死模式：
   ```
   POST /api/auth/login/finish → 200（已下发会话 cookie）
   GET  /api/auth/me           → 401（浏览器没带 cookie）
   ```
   桌面端同序列为 `finish 200 → me 200`。
3. **根因**：页面 `serenique.0icey.icu` 与 API `api.hcyj.xyz` 是**跨站**；移动端 Safari（ITP）/Chrome（第三方 Cookie 拦截）默认丢弃跨站 fetch 响应里设置的 cookie。桌面 Safari 同配置可用 → 平台差异，非服务端问题。

## 修复

- `auth.domain.ts buildSessionCookie`：跨站模式（生产）追加 **`Partitioned`（CHIPS）** 属性——cookie 按顶层站点（serenique.0icey.icu）分区存储，仅该顶层站点下的请求携带；安全语义恰好匹配单用户私有部署。
- 单测：跨站带 Partitioned / 同源不带；272 测试全绿。
- 生产验证：`POST /api/auth/logout` 的 Set-Cookie 头已含 `Secure; Partitioned`（经 hcyj 反代原样透传）。

## 坑

- 跨站 Cookie 场景的调试顺序：先查**服务端会话成功与否**（audit_logs），再查**请求级 cookie 往返**（应用日志里 finish 200 + me 401 = cookie 没进浏览器，不是验证失败）。
- `Partitioned` 需 Safari 17.4+ / Chrome 114+ / Firefox 127+（2026 年主流版本均支持）；过老系统仍会被拦，属浏览器侧限制。
- 备选方案未选：Storage Access API（需用户手势，体验差）、API 同域反代 Worker（改架构，重）。
