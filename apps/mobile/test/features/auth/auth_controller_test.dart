import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import '../../helpers.dart';

void main() {
  test('启动恢复已存 token', () async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
    ]);
    addTearDown(container.dispose);
    // 先读触发 build（启动 _restore），再 pump 让异步恢复完成。
    container.read(authControllerProvider);
    await pumpEventQueue();
    final state = container.read(authControllerProvider);
    expect(state.initializing, isFalse);
    expect(state.token, 'secret');
    expect(state.isAuthenticated, isTrue);
  });

  test('login 校验通过则存储并认证', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      verifyTokenProvider.overrideWithValue((token) async {}),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).login('  secret  ');
    expect(err, isNull);
    expect(storage.value, 'secret'); // trim 后
    expect(container.read(authControllerProvider).isAuthenticated, isTrue);
  });

  test('login 401 返回错误文案且不存储', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      verifyTokenProvider.overrideWithValue((token) async {
        throw const ApiException('UNAUTHORIZED', '未认证或登录已过期');
      }),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).login('bad');
    expect(err, '密钥错误，请检查后重试');
    expect(storage.value, isNull);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });

  test('logout 清空 token', () async {
    final storage = FakeTokenStorage('secret');
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
    ]);
    addTearDown(container.dispose);
    await container.read(authControllerProvider.notifier).logout();
    expect(storage.deletes, 1);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });
}
