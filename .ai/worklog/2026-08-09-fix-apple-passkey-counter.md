# 修复：Apple passkey 登录被 counter 严格校验拒绝

- 日期：2026-08-09
- 提交：`f69eb8a`（+ 生产部署 digest 2e792a0f…）

## 症状

生产环境用户用 Touch ID/指纹登录 → 报「登录验证失败」。审计日志：`auth.login_failed | 凭证计数器未递增，可能存在克隆风险`。

## 根因

**Apple 平台认证器（iCloud Keychain passkey）的 signCount 不递增**——每次断言返回相同值。而代码有**三处**严格递增检查，`newCounter <= storedCounter` 一律拒绝，导致相等被误判为克隆：

1. `auth.service.ts` loginFinish 预检（`parsed.counter <= credRow.counter`）
2. `auth.service.ts` loginFinish 终检（`newCounter <= credRow.counter`）
3. **`@simplewebauthn/server@13.3.2` 库内部**（`verifyAuthenticationResponse`：`counter <= credential.counter` 抛错）——最初只改了自己的两处，测试仍失败，grep 库源码才发现第三处。

## 修复（W3C 规范语义：仅回退拒绝）

- 预检/终检改为 `newCounter < storedCounter` 才拒绝（回退=克隆信号）；相等放行（非递增认证器合法）。
- 传给库的 `credential.counter` **恒传 0** 以禁用库内严格检查（`(counter>0 || stored>0) && counter<=0` 永假），counter 语义完全由我们自己的两处把关。
- 审计消息改为「凭证计数器回退」。
- 测试：新增集成用例「counter 相等 → 200」（RED→GREEN）；「counter 回退 → 401」保持通过。全套 253 集成测试全绿。

## 坑

- `@simplewebauthn/server` 版本不同 counter 行为不同（v12 移出、v13.3 又内置严格检查）——改此类逻辑必须先 grep 库源码确认，不能只改应用层。
- 生产验证走完整链路：CI digest → hpcore digest 拉取 → health ok。移动端调研（`passkey-flutter-research.md`）已预告「counter 宽松校验」，本次一并落地。
