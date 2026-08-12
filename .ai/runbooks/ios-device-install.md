# iOS 真机装机 / 重装

**适用范围**：iPhone 15 Pro（`hpcell`，设备 ID `C11AB076-C53F-5679-AE4E-FD16821ABCCC`），`apps/mobile`（Flutter）。

## 装机 / 重装固定流程

```sh
cd apps/mobile
flutter build ios --release --dart-define=API_BASE_URL=https://api.zeroicey.me
xcrun devicectl device install app --device C11AB076-C53F-5679-AE4E-FD16821ABCCC build/ios/iphoneos/Runner.app
```

## 坑

- **绝不用 debug 构建装真机**：iOS 禁 JIT，独立点击闪退。
- **装机时 iPhone 必须保持解锁亮屏**：锁屏会报 `kAMDMobileImageMounterDeviceLocked: The device is locked`（挂载开发者镜像被拒）；解锁后重跑 `device install` 即可，偶发 `The device disconnected immediately after connecting` 是锁屏/断连所致，等设备恢复 `available` 再重试。
- 免费签名 7 天过期，过期需重签重装。
- 真机调试模式首次跑通参考 `.ai/worklog/2026-08-06-flutter-mobile-ios-device-run.md`（`flutter run` 调试链路）。
