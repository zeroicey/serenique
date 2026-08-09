import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_exception.dart';
import '../../providers.dart';
import 'auth_api.dart';
import 'token_storage.dart';
import 'webauthn.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

class AuthState {
  const AuthState({required this.initializing, required this.session});

  final bool initializing;

  /// serenique_session cookie 值（Keychain 持久化）。
  final String? session;

  bool get isAuthenticated => session != null;
}

class AuthController extends Notifier<AuthState> {
  TokenStorage get _storage => ref.read(tokenStorageProvider);
  AuthApi get _api => ref.read(authApiProvider);
  PasskeyCeremony get _ceremony => ref.read(passkeyCeremonyProvider);

  @override
  AuthState build() {
    _restore();
    return const AuthState(initializing: true, session: null);
  }

  Future<void> _restore() async {
    String? session;
    try {
      session = await _storage.read();
    } catch (_) {
      session = null; // Keychain 读取失败视为未登录，避免闪屏卡死
    }
    state = AuthState(initializing: false, session: session);
    _bump();
  }

  /// 通行密钥登录（ceremony 编排）。返回错误文案；null = 成功（会话已存）。
  Future<String?> loginWithPasskey() async {
    try {
      final result = await loginWithPasskeyCeremony(
        api: _api,
        ceremony: _ceremony,
      );
      final session = result.sessionCookie;
      if (session == null || session.isEmpty) {
        return '登录失败，请重试';
      }
      await _storage.write(session);
      state = AuthState(initializing: false, session: session);
      _bump();
      return null;
    } catch (e) {
      return translateWebauthnError(e, isLogin: true);
    }
  }

  /// 登录态添加通行密钥（设置页）。返回错误文案；null = 成功。
  /// 注册成功服务端也发新会话 cookie，顺手刷新本地会话（无需重新登录）。
  Future<String?> registerDevice({String? deviceLabel}) async {
    try {
      final result = await registerDeviceCeremony(
        api: _api,
        ceremony: _ceremony,
        deviceLabel: deviceLabel,
      );
      final session = result.sessionCookie;
      if (session != null && session.isNotEmpty) {
        await _storage.write(session);
        state = AuthState(initializing: false, session: session);
        _bump();
      }
      return null;
    } catch (e) {
      return translateWebauthnError(e, isLogin: false);
    }
  }

  /// 登出：best-effort 通知服务端清 cookie（失败忽略，本地清除已生效）。
  Future<void> logout() async {
    try {
      await _api.logout();
    } catch (_) {
      // 服务端不可达等：本地清除已生效，忽略
    }
    await _storage.delete();
    state = const AuthState(initializing: false, session: null);
    _bump();
  }

  void _bump() => ref.read(routerRefreshProvider).value++;
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

// ---- 登录页门禁探测（镜像 Web：无参调 register/start）-----------------------

enum RegisterGateStatus {
  /// 凭证计数 0，引导期：首个通行密钥须在浏览器 /setup 创建。
  bootstrap,

  /// 已有凭证，可通行密钥登录。
  ready,

  /// 后端不可达 / 其他错误：显示登录按钮，点击失败 toast。
  error,
}

final registerGateProvider = FutureProvider<RegisterGateStatus>((ref) async {
  try {
    await ref.read(authApiProvider).registerStart(const {});
    // 200（登录态探测成功，正常不应发生）按 401 处理。
    return RegisterGateStatus.ready;
  } on ApiException catch (e) {
    if (e.statusCode == 403) return RegisterGateStatus.bootstrap;
    if (e.statusCode == 401) return RegisterGateStatus.ready;
    return RegisterGateStatus.error;
  } catch (_) {
    return RegisterGateStatus.error;
  }
});
