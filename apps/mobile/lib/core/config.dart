/// 全局配置。API 地址通过 --dart-define=API_BASE_URL 注入。
class AppConfig {
  AppConfig._();

  /// 真机调试时传 `--dart-define=API_BASE_URL=http://<Mac局域网IP>:3000`
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
