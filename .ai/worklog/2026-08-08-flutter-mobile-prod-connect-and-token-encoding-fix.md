# 2026-08-08 — Flutter 移动端：模拟器连生产 + 登录「未知错误」根因修复

本机没有 Android SDK，Flutter 移动端用 **iOS 模拟器（iPhone 17 Pro, iOS 26.5）** 跑，连生产接口 `https://api.zeroicey.me`。排掉两个问题：生产链路直连不稳（走本地 Clash 代理解决）和「正确密钥却报未知错误」（token 编码损坏，App 侧修复）。改动仅限 `apps/mobile`。

## 环境事实（重要）
- 生产 API `api.zeroicey.me` 是 **Azure 美国节点**（`104.208.114.194`，Caddy + Let's Encrypt，非 CDN）。国内直连跨境链路约 **15% 连接在建立阶段被丢**（20 次 curl 失败 3 次，code 000）；走本机 Clash 代理（`127.0.0.1:7897`，Clash Verge + mihomo，`mode: global`）**0% 失败**。
- 模拟器共享宿主网络，`127.0.0.1` 在 App 里就是 Mac 的 `127.0.0.1`。但 Flutter 的 dio 走 dart:io，**不认 iOS 系统 Wi-Fi 代理设置**，只认进程内的 `http(s)_proxy` 环境变量。
- 注入代理 env 的正确姿势：**`SIMCTL_CHILD_https_proxy=http://127.0.0.1:7897` 前缀 + `flutter run`**，flutter 调 simctl launch 时会把 `SIMCTL_CHILD_*` 透传给 App 进程（`ps eww` 验证过）。直接 `simctl launch` 也行但会丢 flutter run attach。

## 根因：token 被 UTF-16 字节序错位损坏
用户从微信类来源复制生产 `AUTH_TOKEN` 粘贴登录，报「未知错误，请稍后重试」；随手打错误密钥却正常返回「密钥错误」。诊断日志（临时 `debugPrint`）抓到：

```
[DIO] type=DioExceptionType.unknown status=null data=null
      err=FormatException: Invalid HTTP header field value: "Bearer 㔀㠀昀㔀　挀㄀㤀㘀…"
```

- 粘贴的 ASCII hex token 被当成 **UTF-16LE 编码、又按 UTF-16BE 解码**：`'5'(U+0035)` → `U+3500『㔀』`，形成低字节为 0 的 CJK 字形串。
- HTTP 请求头不允许非 ASCII → dio 在**发送前**抛 `FormatException` → `ApiException.fromDioException` 落入 UNKNOWN 兜底 →「未知错误」。
- 这解释了悖论：错误密钥（ASCII）头合法能发出、正确密钥（乱码）根本发不出。**与网络/代理完全无关**，Clash 连接监控也证实全程无 `api.zeroicey.me` 请求。

## 修复（apps/mobile）
- 新增 `lib/features/auth/auth_token.dart`：纯函数 `repairTokenEncoding()`（对 `U+XX00` 字形取高字节还原 ASCII，普通 ASCII 原样保留，其余返回 null）+ `isHeaderSafeToken()`（仅 ASCII 可见字符）。
- `AuthController.login()`：先 `repairTokenEncoding`，不可修复或含非法字符时返回明确文案「密钥格式不正确，请重新从服务器复制」，替代晦涩的「未知错误」。
- 新增 `test/features/auth/auth_token_test.dart`（8 用例：幂等/还原/不可还原/全角空格/校验边界）。
- 恢复本地 `.env` 事实：根 `.env` **只有** `DATABASE_URL`/`BLOB_SIGNING_SECRET`，没有 `AUTH_TOKEN` → 生产 token 在服务器上，本地 docker 是认证关闭的 dev 模式（与 08-07 记录一致）。

## 验证
- `flutter analyze` → No issues found。
- `flutter test` → **62/62 PASS**（基线 54 + auth_token 8）。
- 模拟器实测：干净 token（还原后 96 位 hex）登录成功，全程无 `[DIO]` 错误日志；此后 App 会自动还原乱码 token。

## 对下一次会话的提示
- 跑移动端连生产的完整命令：
  ```sh
  cd apps/mobile && SIMCTL_CHILD_https_proxy=http://127.0.0.1:7897 \
    SIMCTL_CHILD_http_proxy=http://127.0.0.1:7897 \
    flutter run -d "iPhone 17 Pro" --dart-define=API_BASE_URL=https://api.zeroicey.me
  ```
  不加代理 env 就是直连，会偶发「未知错误」（跨境丢包，属于生产真用户也会遇到的问题，后续可讨论 App 内代理配置）。
- **别用模拟器「设置 → Wi-Fi → 配置代理」**：dio 走 dart:io 纯 Dart socket，无视系统代理设置。
- 用户常从微信复制 token → 易触发 UTF-16 乱码；App 已自动修复，但**别把 token 当纯字符串信任**，测试登录失败先怀疑输入编码。
- Clash 控制器 unix socket：`curl --unix-socket /tmp/verge/verge-mihomo.sock http://localhost/connections`（TCP `9097` 实际未监听，用 unix socket）。
- 临时诊断日志已移除；以后排查 dio 问题可在 `api_client._guard` 临时加 `debugPrint('[DIO] type=...')`。
