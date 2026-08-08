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
- 免费签名 7 天过期，过期需重签重装。
- 真机调试模式首次跑通参考 `.ai/worklog/2026-08-06-flutter-mobile-ios-device-run.md`（`flutter run` 调试链路）。
