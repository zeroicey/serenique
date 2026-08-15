# iOS 真机装机 / 重装

**适用范围**：iPhone 15 Pro（`hpcell`，设备 ID `C11AB076-C53F-5679-AE4E-FD16821ABCCC`），`apps/mobile`（Flutter）。

## 装机 / 重装固定流程

```sh
cd apps/mobile
# 国内加速入口（hcyj 反代，推荐：国内网络直连 Azure 不稳定 2–12s）
flutter build ios --release --dart-define=API_BASE_URL=https://api.hcyj.xyz/serenique
# 备选：Azure 直连入口
# flutter build ios --release --dart-define=API_BASE_URL=https://api.zeroicey.me
xcrun devicectl device install app --device C11AB076-C53F-5679-AE4E-FD16821ABCCC build/ios/iphoneos/Runner.app
```

- hcyj 带 `/serenique` 路径前缀：Dio baseUrl 直接拼 `/api/...`，Caddy `handle_path` 自动剥前缀（与 Web `VITE_API_BASE_URL` 一致，已验证）
- 验证 baseUrl 已打进包：`strings build/ios/iphoneos/Runner.app/Frameworks/App.framework/App | grep hcyj`

## 坑

- **绝不用 debug 构建装真机**：iOS 禁 JIT，独立点击闪退。
- **装机时 iPhone 必须保持解锁亮屏**：锁屏会报 `kAMDMobileImageMounterDeviceLocked: The device is locked`（挂载开发者镜像被拒）；解锁后重跑 `device install` 即可，偶发 `The device disconnected immediately after connecting` 是锁屏/断连所致，等设备恢复 `available` 再重试。
- 免费签名 7 天过期，过期需重签重装。
- 真机调试模式首次跑通参考 `.ai/worklog/2026-08-06-flutter-mobile-ios-device-run.md`（`flutter run` 调试链路）。
