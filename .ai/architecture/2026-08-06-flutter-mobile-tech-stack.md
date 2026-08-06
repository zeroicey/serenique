# Flutter 移动端技术栈（Mobile Tech Stack）

- 日期：2026-08-06
- 状态：**已定稿**（队长与用户确认，移动端开发的项目记忆）
- 范围：`apps/mobile`（Flutter，iOS 优先，Android 规划）
- 前置记录：`2026-08-06-flutter-mobile-ios-device-run.md`（iOS 真机流程）、`2026-08-05-web-frontend-tech-stack.md`（Web 技术栈，参照物）

## 1. 背景与目标

Serenique 增加移动端 App（iOS + Android），由 Flutter 负责两个平台。iOS 真机编译/部署流程已跑通（iPhone 15 Pro / 免费签名 7 天过期），Android SDK 未装，**iOS 优先**。

移动端消费同一套 REST API（diary / moment / blob / task / event），**契约以 `services/api` 源码为准**。用户熟悉 Web 前端、Flutter 新人，要求技术栈一次定死、避免后面写乱，并写入项目记忆。

## 2. 已锁定技术栈

| 项 | 选择 | 说明 |
|----|------|------|
| 视觉/组件库 | **原生 Material 3** | 内置 `ThemeData`，不引第三方组件库 |
| 图标 | **内置 Material Icons** | `CupertinoIcons` 按需 |
| HTTP | **dio + 轻封装** | 统一解包 `ApiResponse<T>` + token 拦截器位（对应 Web 的 `api/client.ts`） |
| 状态管理 | **Riverpod 3** | 手写 provider 语法，暂不上 `riverpod_generator`（少一个 build_runner 步骤） |
| 路由 | **go_router** | 声明式，≈ React Router |
| 存储 | **shared_preferences** | 偏好/token 占位；`flutter_secure_storage`（Keychain/Keystore）待 auth 后端落地再上 |
| 离线 | **纯在线** | v1 不引本地数据库 |
| 导航 | **Drawer 滑出侧栏** | 模块多，底部 tab 放不下；手机标准侧边栏形态 |
| 文案 | **中文** | 后端消息即中文，直接透传 |
| 表单 | 内置 `Form` + `TextFormField` | 不引表单库 |
| 提示 | 内置 `SnackBar` | — |
| 日期 | `intl` | — |
| 测试 | `flutter test` + `flutter analyze` | 标准 widget/unit test，不引框架 |

**Why**：全部选 Flutter 内置/主流默认，第三方依赖一只手数得过来。Riverpod 的 `FutureProvider` 天然覆盖「服务端状态」（≈ 轻量 TanStack Query），一石二鸟，不用再引 Query 层。shadcn_flutter（Web shadcn 的 Flutter 移植版）评估后不采用：移植生态较新、主题工作量上升，跨端视觉统一靠 `ThemeData` 定制品牌色/圆角即可，不需要整体上移植组件库。

**How to apply**：新模块照 `features/<模块>/` 平铺结构加文件；不引额外的组件库/状态库/表单库/图标库；不混用两套主题风格；模型类手写、对齐 API 源码字段。

## 3. 目录结构（flat，镜像 Web）

`apps/web/src` 采用 `features/<模块>/` 平铺 + 共享 `api/`、`config/`、`lib/` 的标准结构，移动端照此惯例：

```
apps/mobile/lib/
├── main.dart                  # 入口（ProviderScope + runApp）
├── app.dart                   # MaterialApp + 主题（≈ App.tsx）
├── router.dart                # go_router 声明式路由（≈ app/router.tsx）
├── providers.dart             # 全局 provider（≈ app/providers.tsx）
├── core/
│   ├── config.dart            # API 地址等（≈ config/env.ts）
│   ├── network/
│   │   ├── api_client.dart    # dio 单例（≈ api/client.ts）
│   │   ├── api_exception.dart # 统一异常（≈ api/errors.ts）
│   │   └── unwrap.dart        # ApiResponse 解包（≈ api/unwrap.ts）
│   └── theme.dart             # Material 3 主题（≈ styles/）
├── shared/
│   └── widgets/               # 跨模块组件（≈ components/common）
└── features/
    ├── auth/
    │   ├── auth_models.dart
    │   ├── auth_api.dart
    │   ├── auth_providers.dart
    │   └── login_page.dart
    ├── moment/
    │   ├── moment_models.dart     # 手写模型（≈ schemas.ts）
    │   ├── moment_api.dart        # 调 core/network（≈ api.ts）
    │   ├── moment_providers.dart  # Riverpod providers（≈ queries.ts）
    │   ├── moment_list_page.dart  # （≈ pages/moment-list-page.tsx）
    │   ├── moment_detail_page.dart
    │   └── widgets/               # 评论等（≈ components/）
    └── diary/
        ├── diary_models.dart
        ├── diary_api.dart
        ├── diary_providers.dart
        ├── diary_list_page.dart
        └── diary_edit_page.dart
```

对照：`moment_api.dart` ↔ `features/moment/api.ts`，`moment_providers.dart` ↔ `features/moment/queries.ts`，`moment_models.dart` ↔ `features/moment/schemas.ts`。加模块 = 新建一个平铺 feature 文件夹。

## 4. 数据流（Riverpod）

- `apiClientProvider`：dio 单例，全 app 共享。
- 每个列表/详情 = 一个 `FutureProvider`（**类比 TanStack Query 的 query**）。
- 写操作成功后 `ref.invalidate(...)` 对应 provider → 自动重拉（**类比 `invalidateQueries`**）。
- 下拉刷新 `RefreshIndicator` 也是触发 invalidate。
- token：`shared_preferences` 占位存 + dio 拦截器预留 `Authorization` 注入位（与 Web 端预留 token 位同一策略）。

## 5. 路由与导航

go_router 声明式路由（v1）：

| 路径 | 页面 |
|------|------|
| `/` | 主壳（AppBar + Drawer 侧栏） |
| `/moments` | 闪记列表 |
| `/moments/:id` | 闪记详情（含评论） |
| `/diary` | 日记列表 |
| `/diary/:date` | 日记编辑 / 新建 |
| `/login` | 登录占位页（从「设置」进入；auth 后端好了再定是否启动 gate） |

**侧边栏**：AppBar 汉堡按钮 → 滑出 `NavigationDrawer`，列出全部模块（闪记 / 日记 / 任务 / 事件 / 设置…）。加模块 = 菜单加一项，天然可扩展。未来宽屏（iPad/平板）可加常驻 `NavigationRail`（自适应壳），v1 不做。

## 6. API 契约对齐（硬约束）

- 统一响应 `{ success, message, data?, error? }` → 封装 `ApiResponse<T>`；`success:false` 或非 2xx → 抛 `ApiException(code, message)`。
- 列表：`data.items + data.total` 分页（moment / diary 均为该结构）。
- **moment**：`text` ≤500 字；评论 `content` ≤2000 字，响应嵌套 `comments[]` + `commentCount`。
- **diary**：`content` + `diaryDate`（YYYY-MM-DD）。
- 模型类**手写**，对齐源码字段名，不做运行时动态类型。
- 错误消息中文，直接透传展示。

## 7. 环境与 iOS 平台坑

- API 地址走 `--dart-define=API_BASE_URL`；dev 默认 Mac 局域网 IP（真机经 WiFi 访问 `http://192.168.x.x:3000`），prod 用 `https://api.zeroicey.me`。
- **ATS（iOS 独有）**：真机默认禁明文 HTTP，连局域网 `http://` 会失败 → 开发期在 Info.plist 加 ATS 例外，或直接用公网 https。
- 免费签名 7 天过期需重装；Flutter 联网命令要带代理 `http://127.0.0.1:7897`（worklog 已记，直接复用）。

## 8. 测试策略

- 门禁：`flutter analyze` + `flutter test`。
- 单测（纯 Dart，毫秒级）：模型序列化、`ApiResponse` 解包、错误映射。
- widget 测试：列表/详情页用 `ProviderScope(overrides: [...])` 注入 mock provider（类比 Web 用 RTL 注入 mock）。
- 不做集成测试（纯在线、无本地库可测）。

## 9. v1 范围与后续扩展

**v1**：登录占位页（auth 后端未完成，先留位）+ Moment（文本+评论，**附件不做**）+ Diary。

**顺延**（后续版本）：附件上传（`image_picker`/`file_picker`）、task 模块、event 模块、`flutter_secure_storage`（接 auth）、宽屏 NavigationRail、离线缓存。

## 10. 已否决选项

- **shadcn_flutter / flutter-shadcn-ui**（视觉对齐 Web）：移植生态较新，v1 不上。
- **lucide_flutter**（图标对齐 Web）：v1 不上，需要时再补。
- **Bloc / Provider / GetX**：Bloc 过重、Provider 维护模式、GetX 争议大（2026 社区明确不推荐新项目）。
- **retrofit codegen**：过重。
- **底部 tab bar**：模块多、放不下，改 Drawer 侧栏。
- **离线优先**：v1 纯在线。
- **riverpod_generator**：v1 手写 provider，样板多了再上。
