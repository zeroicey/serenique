/// 全局配置。API 地址通过 --dart-define=API_BASE_URL 注入。
class AppConfig {
  AppConfig._();

  /// 真机调试时传 `--dart-define=API_BASE_URL=http://<Mac局域网IP>:3000`
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// WebAuthn RP ID（= 前端域名，不是 API 域名；换域名 = 全部通行密钥失效）。
  static const String rpId = String.fromEnvironment(
    'RP_ID',
    defaultValue: 'serenique.0icey.icu',
  );

  /// 首次设置页（Web 前端）：浏览器打开创建首个通行密钥。
  static String get setupUrl => 'https://$rpId/setup';
}
