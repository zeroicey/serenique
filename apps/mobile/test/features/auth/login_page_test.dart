import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:passkeys/exceptions.dart';
import 'package:serenique_mobile/core/config.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_api.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/auth/webauthn.dart';
import '../../helpers.dart';

/// 登录成功路径需要 GoRouter（context.go('/moments')）。
GoRouter _router() => GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
        GoRoute(
          path: '/moments',
          builder: (_, _) => const Scaffold(body: Text('moments-page')),
        ),
      ],
    );

/// 假 AuthApi：登录成功返回会话；可配置 finish 抛错。
class _StubAuthApi extends AuthApi {
  _StubAuthApi() : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  Object? finishError;

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
    if (finishError != null) throw finishError!;
    return (data: {'authenticated': true}, sessionCookie: 'sess123');
  }
}

Future<void> _pumpLogin(
  WidgetTester tester, {
  required RegisterGateStatus gate,
  _StubAuthApi? api,
  FakePasskeyCeremony? ceremony,
}) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
      registerGateProvider.overrideWith((ref) async => gate),
      authApiProvider.overrideWithValue(api ?? _StubAuthApi()),
      passkeyCeremonyProvider.overrideWithValue(
        ceremony ??
            FakePasskeyCeremony(authenticateResult: {'id': 'cred', 'response': {}}),
      ),
    ],
    child: MaterialApp.router(routerConfig: _router()),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('引导期：首次使用卡片 + 完整 URL + 登录按钮', (tester) async {
    await _pumpLogin(tester, gate: RegisterGateStatus.bootstrap);
    expect(find.text('首次使用 Serenique？'), findsOneWidget);
    expect(find.textContaining('账户已由部署者创建'), findsOneWidget);
    expect(find.text(AppConfig.setupUrl), findsOneWidget);
    // 引导期标题 =「创建完成后…」，按钮 =「使用通行密钥登录」
    expect(find.text('创建完成后，用通行密钥登录'), findsOneWidget);
    expect(find.text('使用通行密钥登录'), findsOneWidget);
  });

  testWidgets('正常态：仅登录按钮，无首次使用卡片', (tester) async {
    await _pumpLogin(tester, gate: RegisterGateStatus.ready);
    expect(find.text('首次使用 Serenique？'), findsNothing);
    // 标题与按钮同文案
    expect(find.text('使用通行密钥登录'), findsNWidgets(2));
  });

  testWidgets('网络错误：登录按钮 + 错误提示', (tester) async {
    await _pumpLogin(tester, gate: RegisterGateStatus.error);
    expect(find.text('首次使用 Serenique？'), findsNothing);
    expect(find.text('使用通行密钥登录'), findsNWidgets(2));
    expect(find.text('无法连接服务器，请检查网络后重试'), findsOneWidget);
  });

  testWidgets('登录成功：跳转 /moments', (tester) async {
    await _pumpLogin(tester, gate: RegisterGateStatus.ready);
    await tester.tap(find.widgetWithText(FilledButton, '使用通行密钥登录'));
    await tester.pumpAndSettle();
    expect(find.text('moments-page'), findsOneWidget);
  });

  testWidgets('用户取消：toast 显示中文文案，不跳转', (tester) async {
    final ceremony = FakePasskeyCeremony(
      authenticateError: PasskeyAuthCancelledException(),
    );
    await _pumpLogin(tester, gate: RegisterGateStatus.ready, ceremony: ceremony);
    await tester.tap(find.widgetWithText(FilledButton, '使用通行密钥登录'));
    await tester.pumpAndSettle();
    expect(find.text('已取消或没有可用的通行密钥'), findsOneWidget);
    expect(find.text('moments-page'), findsNothing);
  });

  testWidgets('服务端拒绝（401）：透传服务端文案', (tester) async {
    final api = _StubAuthApi()
      ..finishError = const ApiException('UNAUTHORIZED', '登录验证失败', statusCode: 401);
    await _pumpLogin(tester, gate: RegisterGateStatus.ready, api: api);
    await tester.tap(find.widgetWithText(FilledButton, '使用通行密钥登录'));
    await tester.pumpAndSettle();
    expect(find.text('登录验证失败'), findsOneWidget);
    expect(find.text('moments-page'), findsNothing);
  });
}
