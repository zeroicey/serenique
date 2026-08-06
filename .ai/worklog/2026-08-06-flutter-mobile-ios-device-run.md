# 2026-08-06 — Flutter 移动端首次真机运行（iOS）

初始化 `apps/mobile`（Flutter 3.44.8 stable）后，首次跑通「iPhone 真机 + 调试模式」整套流程。App 已成功装到 iPhone 15 Pro（`hpcell`）上并启动。

## 关键事实（本次确认）

- **工程**：`apps/mobile`，flutter create 默认脚手架，目前零第三方插件（仅 cupertino_icons），Bundle ID `com.example.sereniqueMobile`。
- **环境**：Flutter 3.44.8 stable（`~/workspace/environment/flutter`）、Xcode 26.6、CocoaPods 1.17.0。**Android SDK 未安装**（`flutter doctor` 报缺，不影响 iOS）。
- **设备**：iPhone 15 Pro（设备名 `hpcell`），iOS 26.5.2，UDID `00008130-000144D21451001C`，USB 直连。
- **签名**：`CODE_SIGN_STYLE = Automatic`，`DEVELOPMENT_TEAM = ZWYHWSH3RJ`（个人免费团队，Xcode 自动管理签名）。免费签名 7 天过期需重签。
- **运行命令必须走代理**：本机 shell 默认**没有** `http_proxy`，Flutter 工具链联网操作（pub 解析、版本检查等）会卡死/超时。代理 `http://127.0.0.1:7897`。

## 完整流程（可复现）

1. **连机 + 配对**
   - 数据线连 Mac，解锁手机，弹「信任此电脑」点信任。
   - iOS 16+ 开「开发者模式」：设置 → 隐私与安全性 → 开发者模式（首次连接时 Xcode/Flutter 也会引导，需要重启一次手机）。
   - 配对未完成时的特征：`xcrun devicectl list devices` 显示 `connected (no DDI)`，`flutter devices` 报 `unpaired`。用 Xcode → Window → Devices and Simulators 触发配对即可。
2. **配置签名（一次性，需交互）**
   - Xcode → Settings → Accounts → 添加 Apple ID（要 2FA，只能人肉操作）。
   - `open ios/Runner.xcworkspace` → Runner target → Signing & Capabilities → 勾 Automatically manage signing → Team 选个人 Apple ID。Xcode 会把 `DEVELOPMENT_TEAM` 写进 `project.pbxproj`。
3. **跑真机（带代理）**
   ```sh
   cd apps/mobile
   HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
   http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
   flutter run -d hpcell
   ```
   首次构建约 96s，缓存后约 52s，安装+启动约 13s。
4. **首次安装信任开发者证书（关键一步）**
   - 手机首次装开发版会提示「未受信任的开发者」→ 手机「设置 → 通用 → VPN 与设备管理 → Developer App」里信任该开发者即可。**这是首次能否启动的最大坑。**

## 验证结果

- `flutter devices` 识别 `hpcell`（iOS 26.5.2）。
- `flutter run` 输出 `Xcode build done. 52.0s` → `Installing and launching... 13.2s` → `Syncing files to device hpcell... 30ms` → `Flutter run key commands.`（调试连接建立）。
- **可复现性验证**：文档写完后停掉实例、按上述流程干净重跑一次，`Xcode build done. 18.1s`（缓存更热）→ `Installing and launching... 11.0s` → 启动成功，无任何报错。整套流程照抄即可用。
- iPhone 屏幕已显示 Flutter 默认 counter 页面。

## 对下一次会话的提示（pitfalls）

- **shell 没有 http_proxy**：直接 `flutter run` 会卡在工具链联网步骤。跑任何 Flutter 联网命令都加 `HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7897`（`no_proxy` 保留 localhost/Tailscale）。
- **「Flutter could not access the local network / port 5353」**：第一次跑报过此错（mDNS 连 Dart VM）。先确认手机端开发者证书已信任；若仍复现，检查 Mac「系统设置 → 隐私与安全性 → 本地网络」给宿主终端（本机是 VS Code）授权，必要时重启终端。
- **「不安全 / 未受信任开发者」= 手机端开发者证书未信任**，不是网络问题。信任路径：设置 → 通用 → VPN 与设备管理。
- **免费签名 7 天过期**：重跑 `flutter run` 前若报签名失效，重新安装一次即可。
- **Android SDK 缺失**：`flutter doctor` 的 Android 项会一直红，跑 iOS 无影响；要跑 Android 再装。
- **CocoaPods 暂无网络需求**：工程还没 Podfile（无插件）；以后加插件会引入 pod install，届时同样要代理。
- **后台 `flutter run` 是长驻进程**（热重载 `r`/`R`/`q`），结束 Claude 会话会被杀掉；要自己迭代就在终端里跑上面那条带代理的命令。
