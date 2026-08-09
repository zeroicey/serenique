# 2026-08-09 — Flutter Passkey 接入调研（移动端 phase 预案）

后端 Passkey 认证重构设计中（`.ai/requirements/2026-08-09-passkey-auth.md`，决策⑧「移动端也走 Passkey」）。本次为移动端 Flutter phase 预研：查证 Flutter 支持 Passkey 的方案、两端兼容、认证流程与坑。**结论已回写需求文档**（移动端小节 + 决策⑧）。无代码改动。

## 调研结论（核心）

- **插件选型**：corbado `passkeys`（pub.dev 已验证发布者，152k 下载）——一个 Dart API 覆盖 Android/iOS/macOS/Web/Windows，桥接 iOS AuthenticationServices + Android Credential Manager；自带 debugMode 诊断（RPID/AASA/assetlinks 检查）。Flutter 无内置 passkey API，官方 `passkey_android`/`passkey_ios` 存在但平台分离、API 底层，不选。
- **服务端「零改动」不成立**，两处必须配合：
  1. `expectedOrigin` 白名单数组：Web 与 **iOS 原生 origin 相同**（`https://serenique-web.pages.dev`）；**Android 原生 origin 是 `android:apk-key-hash:<base64url(SHA-256 签名指纹)>`**（无 scheme/port，非 URL 格式）→ `WEBAUTHN_ORIGINS` 需支持此类条目。
  2. **counter 必须宽松校验**：iOS/Android 同步型 passkey（iCloud/Google）counter 恒 0，严格递增校验会误杀。
- **共享凭证机制**：passkey 按 RP ID 存储于 iCloud Keychain / Google Password Manager；App 完成域名关联后自动复用 Web 创建的 passkey，无需迁移。
- **关联文件**（都托管在 RP ID 域，即 `serenique-web.pages.dev/.well-known/`）：
  - iOS：`apple-app-site-association`（`{"webcredentials":{"apps":["<TEAMID>.<bundleID>"]}}`）+ Xcode Associated Domains entitlement（`webcredentials:serenique-web.pages.dev`）
  - Android：`assetlinks.json`（relation `delegate_permission/common.get_login_creds` + 包名 + **debug/release/Play App Signing 全部 SHA-256 指纹**）
  - 三处字符串必须字节一致：RP ID = entitlement 域名 = 关联文件内容
- **版本要求**：iOS 16+（Podfile deployment target 16.0）/ Android 9+ API 28。Android 必须改 `MainActivity` → `FlutterFragmentActivity`（否则 Credential Manager 直接崩）。
- **会话形态**：后端 login/finish 发 HttpOnly cookie → Flutter 需 cookie jar（dio_cookie_manager）持久化，或后端响应体顺带返回 token；设计文档备选「移动端直接用 API token」可作兜底。
- **关键参数**：`userVerification: required`、`residentKey: required`（可发现凭证）、`attestation: none`、`excludeCredentials` 传已有凭证防重复。

## 坑 / 对下一次会话的提示（实施时逐条核对）

- 关联文件配置是最大坑：RPID 不一致 / 指纹错 / AASA appID 拼错 / 文件重定向或 content-type 错 → 报错隐晦（iOS `ASAuthorizationError` 1000、Android `GetCredentialUnknownException`）。
- **Apple 侧 AASA 有缓存**，改动后需等待生效。
- Android 模拟器：必须 Play Store 镜像 + API 33/34 + 登录 Google 账号 + 设置锁屏/指纹，缺一即 `SyncAccountNotAvailableException`；真机无此问题。
- iOS 模拟器：需 Features → Face ID → Enrolled 后才可用 passkey。
- **真机/端到端测试必须公网 HTTPS 域名**（关联校验只认 live 域），localhost 跑不通——开发期就要在 pages.dev 上部署好两个 well-known 文件。
- Android debug 包必须用 debug 指纹验证（`keytool -list -v`），release/Play App Signing 各一指纹，都要进 assetlinks。
- 换前端域名 = 全部 passkey 失效（含移动端）。
- 详细实施步骤参考 MojoAuth《Add Passkeys to Flutter in 30 Minutes》与 corbado passkeys 包 README（来源见下）。

## 来源

1. https://pub.dev/packages/passkeys — 插件 API、平台要求、两端排障清单、模拟器注意事项（主来源）
2. https://www.corbado.com/blog/webauthn-origin-validation-native-apps — 两端 origin 差异 + simplewebauthn 多 origin 配置（关键）
3. https://mojoauth.com/blog/add-passkeys-to-flutter-in-30-minutes — 完整配置流程 + 失败对照表
4. https://dev.to/corbado/cross-device-passkey-sync-between-web-ios-android-app-bn5 — Web/App 共享凭证机制
5. https://simplewebauthn.dev/docs/advanced/passkeys/ + https://developers.google.com/identity/passkeys/developer-guides/server-authentication — 服务端校验语义
6. https://fixdevs.com/blog/passkey-webauthn-not-working/ — rpId/origin 错误汇总
