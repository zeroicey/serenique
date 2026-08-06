import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../providers.dart';
import 'token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

/// 登录时用输入的密钥调 /api/auth/me 校验。抛 ApiException；UNAUTHORIZED = 密钥错。
final verifyTokenProvider = Provider<Future<void> Function(String token)>((ref) {
  return (token) async {
    final client = ApiClient(baseUrl: AppConfig.apiBaseUrl, tokenReader: () => token);
    await client.getData('/api/auth/me');
  };
});

class AuthState {
  const AuthState({required this.initializing, required this.token});

  final bool initializing;
  final String? token;

  bool get isAuthenticated => token != null;
}

class AuthController extends Notifier<AuthState> {
  TokenStorage get _storage => ref.read(tokenStorageProvider);

  @override
  AuthState build() {
    _restore();
    return const AuthState(initializing: true, token: null);
  }

  Future<void> _restore() async {
    final token = await _storage.read();
    state = AuthState(initializing: false, token: token);
    _bump();
  }

  /// 校验 + 存入。返回错误文案；null = 成功。
  Future<String?> login(String token) async {
    final trimmed = token.trim();
    try {
      await ref.read(verifyTokenProvider)(trimmed);
    } on ApiException catch (e) {
      if (e.code == 'UNAUTHORIZED' || e.statusCode == 401) {
        return '密钥错误，请检查后重试';
      }
      rethrow;
    }
    await _storage.write(trimmed);
    state = AuthState(initializing: false, token: trimmed);
    _bump();
    return null;
  }

  Future<void> logout() async {
    await _storage.delete();
    state = const AuthState(initializing: false, token: null);
    _bump();
  }

  void _bump() => ref.read(routerRefreshProvider).value++;
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
