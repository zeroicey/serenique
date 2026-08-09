import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passkeys/exceptions.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_api.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/webauthn.dart';
import '../../helpers.dart';

/// 记录调用参数的假 AuthApi。
class _StubAuthApi extends AuthApi {
  _StubAuthApi() : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  /// login/register finish 返回的会话 cookie；null = 服务端没下发。
  String? sessionCookie = 'sess123';

  /// login/register finish 抛错（服务端拒绝）。
  Object? finishError;

  int logoutCalls = 0;
  int loginFinishCalls = 0;
  int registerFinishCalls = 0;

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      loginStart() async {
    return (challengeId: 'c1', options: {'challenge': 'Y2g', 'rpId': 'x'});
  }

  @override
  Future<CeremonyResult> loginFinish({
    required String challengeId,
    required Map<String, dynamic> credential,
  }) async {
    loginFinishCalls++;
    if (finishError != null) throw finishError!;
    return (data: {'authenticated': true}, sessionCookie: sessionCookie);
  }

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      registerStart([Map<String, dynamic> body = const {}]) async {
    return (
      challengeId: 'c2',
      options: {'challenge': 'aGVsbG8', 'rp': {}, 'user': {}},
    );
  }

  @override
  Future<CeremonyResult> registerFinish({
    required String challengeId,
    String? deviceLabel,
    required Map<String, dynamic> credential,
  }) async {
    registerFinishCalls++;
    if (finishError != null) throw finishError!;
    return (data: {'authenticated': true}, sessionCookie: sessionCookie);
  }

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

void main() {
  test('启动恢复已存 session', () async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
    ]);
    addTearDown(container.dispose);
    container.read(authControllerProvider);
    await pumpEventQueue();
    final state = container.read(authControllerProvider);
    expect(state.initializing, isFalse);
    expect(state.session, 'sess123');
    expect(state.isAuthenticated, isTrue);
  });

  test('loginWithPasskey 成功：捕获 Set-Cookie 会话并认证', () async {
    final storage = FakeTokenStorage();
    final api = _StubAuthApi()..sessionCookie = 'new-sess';
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(api),
      passkeyCeremonyProvider.overrideWithValue(FakePasskeyCeremony(
        authenticateResult: {'id': 'cred', 'response': {}},
      )),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).loginWithPasskey();
    expect(err, isNull);
    expect(storage.value, 'new-sess');
    expect(container.read(authControllerProvider).isAuthenticated, isTrue);
  });

  test('loginWithPasskey 服务端没下发会话 → 登录失败文案', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(_StubAuthApi()..sessionCookie = null),
      passkeyCeremonyProvider.overrideWithValue(FakePasskeyCeremony(
        authenticateResult: {'id': 'cred', 'response': {}},
      )),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).loginWithPasskey();
    expect(err, '登录失败，请重试');
    expect(storage.value, isNull);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });

  test('loginWithPasskey 用户取消（插件异常）→ 中文文案且不认证', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(_StubAuthApi()),
      passkeyCeremonyProvider.overrideWithValue(
        FakePasskeyCeremony(authenticateError: PasskeyAuthCancelledException()),
      ),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).loginWithPasskey();
    expect(err, '已取消或没有可用的通行密钥');
    expect(storage.value, isNull);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });

  test('loginWithPasskey 网络错误 → 服务暂时不可用', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(_StubAuthApi()),
      passkeyCeremonyProvider.overrideWithValue(
        FakePasskeyCeremony(authenticateError: UnhandledAuthenticatorException('x', null, null)),
      ),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).loginWithPasskey();
    expect(err, '通行密钥验证失败，请重试');
    expect(storage.value, isNull);
  });

  test('loginWithPasskey 服务端拒绝（401 业务错误）→ 透传文案', () async {
    final storage = FakeTokenStorage();
    final api = _StubAuthApi()
      ..finishError = const ApiException('UNAUTHORIZED', '登录验证失败', statusCode: 401);
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(api),
      passkeyCeremonyProvider.overrideWithValue(FakePasskeyCeremony(
        authenticateResult: {'id': 'cred', 'response': {}},
      )),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).loginWithPasskey();
    expect(err, '登录验证失败');
    expect(storage.value, isNull);
  });

  test('registerDevice 成功：注册会话刷新（无需重新登录）', () async {
    final storage = FakeTokenStorage('old-sess');
    final api = _StubAuthApi()..sessionCookie = 'fresh-sess';
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(api),
      passkeyCeremonyProvider.overrideWithValue(FakePasskeyCeremony(
        registerResult: {'id': 'cred', 'response': {}},
      )),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).registerDevice();
    expect(err, isNull);
    expect(api.registerFinishCalls, 1);
    expect(storage.value, 'fresh-sess');
    expect(container.read(authControllerProvider).isAuthenticated, isTrue);
  });

  test('registerDevice 取消 → 已取消注册', () async {
    final storage = FakeTokenStorage('old-sess');
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(_StubAuthApi()),
      passkeyCeremonyProvider.overrideWithValue(
        FakePasskeyCeremony(registerError: PasskeyAuthCancelledException()),
      ),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).registerDevice();
    expect(err, '已取消注册');
    expect(storage.value, 'old-sess'); // 原会话不受影响
  });

  test('logout：best-effort 调服务端 + 清本地 session', () async {
    final storage = FakeTokenStorage('sess123');
    final api = _StubAuthApi();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authApiProvider.overrideWithValue(api),
    ]);
    addTearDown(container.dispose);
    await container.read(authControllerProvider.notifier).logout();
    expect(api.logoutCalls, 1);
    expect(storage.deletes, 1);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });

  group('registerGateProvider（门禁探测）', () {
    Future<RegisterGateStatus> probe(ProviderContainer container) async {
      final future = container.read(registerGateProvider.future);
      await pumpEventQueue();
      return future;
    }

    test('403 → 引导期（bootstrap）', () async {
      final container = ProviderContainer(overrides: [
        authApiProvider.overrideWithValue(
          _ProbeApi(const ApiException('FORBIDDEN', '引导注册令牌不正确', statusCode: 403)),
        ),
      ]);
      addTearDown(container.dispose);
      expect(await probe(container), RegisterGateStatus.bootstrap);
    });

    test('401 → 正常登录态（ready）', () async {
      final container = ProviderContainer(overrides: [
        authApiProvider.overrideWithValue(
          _ProbeApi(const ApiException('UNAUTHORIZED', '请先登录后再添加新的登录凭证', statusCode: 401)),
        ),
      ]);
      addTearDown(container.dispose);
      expect(await probe(container), RegisterGateStatus.ready);
    });

    test('200 → ready（异常情况按 401 处理）', () async {
      final container = ProviderContainer(overrides: [
        authApiProvider.overrideWithValue(_StubAuthApi()),
      ]);
      addTearDown(container.dispose);
      expect(await probe(container), RegisterGateStatus.ready);
    });

    test('500 / 网络错误 → error', () async {
      final container = ProviderContainer(overrides: [
        authApiProvider.overrideWithValue(
          _ProbeApi(const ApiException('INTERNAL', '服务错误', statusCode: 500)),
        ),
      ]);
      addTearDown(container.dispose);
      expect(await probe(container), RegisterGateStatus.error);
    });
  });
}

/// 门禁探测专用：registerStart 抛固定异常。
class _ProbeApi extends AuthApi {
  _ProbeApi(this.error)
      : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  final Object error;

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      registerStart([Map<String, dynamic> body = const {}]) async {
    throw error;
  }
}
