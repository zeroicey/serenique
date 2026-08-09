import 'package:serenique_mobile/features/auth/token_storage.dart';
import 'package:serenique_mobile/features/auth/webauthn.dart';

/// 测试用内存会话存储。
class FakeTokenStorage implements TokenStorage {
  FakeTokenStorage([this.value]);

  String? value;
  int writes = 0;
  int deletes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
    writes++;
  }

  @override
  Future<void> delete() async {
    value = null;
    deletes++;
  }
}

/// 测试用假 ceremony：记录收到的 options JSON，按配置返回 credential 或抛错。
class FakePasskeyCeremony implements PasskeyCeremony {
  FakePasskeyCeremony({
    this.registerResult,
    this.authenticateResult,
    this.registerError,
    this.authenticateError,
  });

  /// 返回给 finish 段的 credential JSON map（默认空 map）。
  Map<String, dynamic>? registerResult;
  Map<String, dynamic>? authenticateResult;

  /// 设置后对应 ceremony 抛该异常（翻译层应处理）。
  Object? registerError;
  Object? authenticateError;

  String? lastRegisterOptions;
  String? lastAuthenticateOptions;

  @override
  Future<Map<String, dynamic>> register(String optionsJson) async {
    lastRegisterOptions = optionsJson;
    if (registerError != null) throw registerError!;
    return registerResult ?? {};
  }

  @override
  Future<Map<String, dynamic>> authenticate(String optionsJson) async {
    lastAuthenticateOptions = optionsJson;
    if (authenticateError != null) throw authenticateError!;
    return authenticateResult ?? {};
  }
}
