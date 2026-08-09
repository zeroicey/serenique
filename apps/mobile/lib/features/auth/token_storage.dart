import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/network/api_client.dart';

/// 会话存取抽象：生产用 Keychain/Keystore，测试注入内存假实现。
/// 存的是 login/register finish 响应 Set-Cookie 里的 serenique_session 值。
abstract class TokenStorage {
  Future<String?> read();
  Future<void> write(String session);
  Future<void> delete();
}

/// 生产实现：iOS Keychain / Android Keystore。
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = sessionCookieName;
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String session) => _storage.write(key: _key, value: session);

  @override
  Future<void> delete() => _storage.delete(key: _key);
}
