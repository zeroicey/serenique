# serenique_mobile

Serenique 的移动端 App（iOS + Android，v1 已完成 iOS 优先）。

**技术栈**：Flutter (Material3) + dio + Riverpod 3 + go_router，消费 Serenique REST API。

## 模块

- 壳 + Drawer 导航（闪记 / 日记，登录占位）
- 闪记（Moment）：列表 / 新建 / 详情 / 评论
- 日记（Diary）：列表 / 按日期新建 / 编辑 / 删除

## 环境与网络

本机 shell 默认**没有** `http_proxy`，Flutter 工具链联网操作（pub 解析、pod install、版本检查）会卡死/超时。**所有 Flutter 联网命令都需带代理**：

```sh
# 在 apps/mobile 下执行
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter pub get
```

## 运行

iOS 真机（iPhone 已连接、签名已配置）运行，API 指向 Mac 局域网：

```sh
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000
```

- `API_BASE_URL` 通过 `--dart-define` 注入，默认 `http://localhost:3000`（模拟器/iOS 模拟器可用）。
- 首次安装需在手机「设置 → 通用 → VPN 与设备管理 → Developer App」信任开发者证书。
- **免费签名 7 天过期**：重跑 `flutter run` 前若报签名失效，重新安装一次即可。
- iOS 开发期在 `Info.plist` 加了 ATS 明文 HTTP 例外（连 Mac 局域网 API），**发布前需收紧**。

## 认证

- 启动走 `/splash`，`AuthController` 从安全存储恢复密钥；无密钥 → `/login` 登录页。
- 登录页录入 `AUTH_TOKEN`（后端根 `.env` 的共享密钥）→ 先调 `GET /api/auth/me` 校验 → 通过后存 iOS Keychain / Android Keystore（`flutter_secure_storage`）→ 全局 `ApiClient` 给所有请求带 `Authorization: Bearer <AUTH_TOKEN>`。
- 任何请求返回 401 自动登出（清存储 + 重定向到 `/login`）。
- **dev 后端未配置 `AUTH_TOKEN` 时登录恒通过**（后端跳过认证，`/api/auth/me` 直接 200）。要在本地验证真实登录，需把本地 API 重启到 auth 代码并在根 `.env` 配 `AUTH_TOKEN`，或等公网部署强制认证。

## 测试

```sh
flutter analyze   # No issues found
flutter test      # 34/34 PASS
```
