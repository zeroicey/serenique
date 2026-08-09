# 2026-08-09 — Flutter 移动端 Passkey 接入设计（auth 重构移动端 phase 定稿）

后端 Passkey 认证重构（v0.5.0）与 Web 端已完成，为移动端 phase 产出设计文档：`2026-08-09-flutter-passkey-auth-design.md`（已定稿，08-07 旧 token 方案文档加取代横幅）。无代码改动。

## 关键结论（实施时必读）

- **插件**：corbado `passkeys` 2.22.1；服务端 options JSON 与插件 `RegisterRequestType/AuthenticateRequestType.fromJsonString` **直接兼容，零字段映射**；响应 toJson 与服务端 zod schema 逐字段对齐。
- **唯一差异点**：插件注册响应 `transports` 在 `response.transports` 内层，服务端期望顶层 → finish 时映射到顶层（不映射只是丢元数据，Zod 剥离不报错）。
- **会话**：服务端 HttpOnly cookie（生产带 `Partitioned`）→ 移动端捕获 Set-Cookie 存 flutter_secure_storage + 请求头手动加 `Cookie:`，不引 cookie jar。
- **Origin 校验（服务端唯一的配合项）**：finish 请求的 Origin header 决定 expectedOrigin。iOS 原生 clientDataJSON origin = `https://<RP_ID>`（与 Web 相同，现网即可）；**Android = `android:apk-key-hash:<指纹>`，必须追加进 `WEBAUTHN_ORIGINS` 且移动端带同串 Origin header**，否则 Android 登录 403「请求来源不受信任」。
- **首次注册**：严格按需求走浏览器 `/setup`（凭证计数 0 = 引导期需 SETUP_TOKEN）；移动端登录页只做门禁探测（无参 register/start：403=引导期提示 / 401=登录按钮）+ 前端地址指引，不提供 SETUP_TOKEN 输入。
- **域名关联文件**：AASA（iOS 需 TEAMID.bundleID）+ assetlinks.json（Android 需 debug/release 指纹）托管在 Web 前端域 `.well-known/`，App 与浏览器共享 passkey 的前提。
- **平台配置**：iOS Podfile 16.0 + webcredentials entitlement（真机必需）；Android minSdk 28 + `FlutterFragmentActivity`（否则 Credential Manager 直接崩）。

## 对下一次会话的提示

- 实施顺序：前置（Web 部署两个 well-known + 服务端 WEBAUTHN_ORIGINS 加 apk-key-hash）→ 基础设施（pubspec/Podfile/session 改造）→ 登录页 → 设置页三 tab → iOS 模拟器全流程 smoke。
- Android SDK 未装，Android phase 后置（指纹/包名/模拟器镜像）。
- 参考：Web `webauthn.ts`（错误翻译 7 类中文文案）、`auth.handler.ts`（Origin 校验 + Set-Cookie 组装）、corbado flutter-passkeys 仓库 types.dart。
