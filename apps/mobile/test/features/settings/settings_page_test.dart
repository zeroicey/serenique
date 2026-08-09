import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_api.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/settings/settings_page.dart';
import '../../helpers.dart';

/// 设置页三 tab 共用假 AuthApi：内存数据 + 记录写操作参数。
class _FakeAuthApi extends AuthApi {
  _FakeAuthApi() : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  UserEntry user = const UserEntry(
    id: 'u1',
    name: '张三',
    email: 'a@b.c',
    birthday: '1990-01-01',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  );
  List<CredentialEntry> creds = [
    const CredentialEntry(
      id: 'c1',
      credentialId: 'cred1',
      deviceLabel: 'iPhone · Apple',
      transports: ['internal'],
      counter: 1,
      lastUsedAt: null,
      createdAt: '2026-08-01T00:00:00Z',
    ),
  ];
  List<TokenEntry> tokens = [
    const TokenEntry(
      id: 't1',
      name: 'macbook',
      prefix: 'abc12345',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-08-01T00:00:00Z',
    ),
  ];

  Object? deleteCredentialError;
  int deleteCredentialCalls = 0;
  int revokeCalls = 0;
  String? lastProfileName;
  String? lastProfileEmail;
  String? lastProfileBirthday;
  String? lastCreatedTokenName;

  @override
  Future<UserEntry> getProfile() async => user;

  @override
  Future<UserEntry> updateProfile({
    String? name,
    String? email,
    String? birthday,
  }) async {
    lastProfileName = name;
    lastProfileEmail = email;
    lastProfileBirthday = birthday;
    user = UserEntry(
      id: user.id,
      name: name == null ? user.name : (name.isEmpty ? null : name),
      email: email == null ? user.email : (email.isEmpty ? null : email),
      birthday:
          birthday == null ? user.birthday : (birthday.isEmpty ? null : birthday),
      createdAt: user.createdAt,
      updatedAt: '2026-08-09T00:00:00Z',
    );
    return user;
  }

  @override
  Future<List<CredentialEntry>> listCredentials() async => creds;

  @override
  Future<void> deleteCredential(String id) async {
    deleteCredentialCalls++;
    if (deleteCredentialError != null) throw deleteCredentialError!;
    creds = creds.where((c) => c.id != id).toList();
  }

  @override
  Future<List<TokenEntry>> listTokens() async => tokens;

  @override
  Future<TokenCreateResult> createToken(String name) async {
    lastCreatedTokenName = name;
    final item = TokenEntry(
      id: 't2',
      name: name,
      prefix: 'xyz98765',
      lastUsedAt: null,
      revokedAt: null,
      createdAt: '2026-08-09T00:00:00Z',
    );
    tokens = [...tokens, item];
    return TokenCreateResult(
      plaintext: 'serenique_xyz98765_明文仅此一次',
      item: item,
    );
  }

  @override
  Future<void> revokeToken(String id) async {
    revokeCalls++;
    tokens = [
      for (final t in tokens)
        if (t.id == id)
          TokenEntry(
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            lastUsedAt: t.lastUsedAt,
            revokedAt: '2026-08-09T01:00:00Z',
            createdAt: t.createdAt,
          )
        else
          t,
    ];
  }
}

Future<void> _pumpSettings(WidgetTester tester, _FakeAuthApi api) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
      authApiProvider.overrideWithValue(api),
    ],
    child: const MaterialApp(home: SettingsPage()),
  ));
  await tester.pumpAndSettle();
}

Future<void> switchTab(WidgetTester tester, String label) async {
  await tester.tap(find.text(label));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('三 tab 渲染：个人信息默认选中并回填', (tester) async {
    await _pumpSettings(tester, _FakeAuthApi());
    expect(find.text('个人信息'), findsOneWidget);
    expect(find.text('登录凭证'), findsOneWidget);
    expect(find.text('API 令牌'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
    // 个人信息表单回填
    expect(find.text('张三'), findsOneWidget);
    expect(find.text('a@b.c'), findsOneWidget);
    expect(find.text('1990-01-01'), findsOneWidget);
  });

  testWidgets('个人信息：空串提交 → 清除语义（服务端归一化为 null）', (tester) async {
    final api = _FakeAuthApi();
    await _pumpSettings(tester, api);
    // 清空姓名（email/birthday 保持），保存
    await tester.enterText(find.byType(TextField).first, '');
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(api.lastProfileName, '');
    expect(api.lastProfileEmail, 'a@b.c');
    expect(api.lastProfileBirthday, '1990-01-01');
    expect(find.text('个人信息已更新'), findsOneWidget);
  });

  testWidgets('登录凭证：列表 + 删除 409 服务端文案透传', (tester) async {
    final api = _FakeAuthApi()
      ..deleteCredentialError = const ApiException(
        'CONFLICT',
        '至少需要保留一把登录凭证',
        statusCode: 409,
      );
    await _pumpSettings(tester, api);
    await switchTab(tester, '登录凭证');
    expect(find.text('iPhone · Apple'), findsOneWidget);
    expect(find.text('设备内置'), findsOneWidget); // transports 中文名
    expect(find.text('添加通行密钥'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    expect(find.text('删除登录凭证'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();

    expect(api.deleteCredentialCalls, 1);
    expect(find.text('至少需要保留一把登录凭证'), findsOneWidget);
    // 列表未被清空
    expect(find.text('iPhone · Apple'), findsOneWidget);
  });

  testWidgets('登录凭证：删除成功刷新列表', (tester) async {
    final api = _FakeAuthApi();
    await _pumpSettings(tester, api);
    await switchTab(tester, '登录凭证');
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();
    expect(find.text('暂无登录凭证'), findsOneWidget);
    expect(find.text('iPhone · Apple'), findsNothing);
  });

  testWidgets('API 令牌：创建 → 明文仅显示一次弹窗，关闭即消失', (tester) async {
    final api = _FakeAuthApi();
    await _pumpSettings(tester, api);
    await switchTab(tester, 'API 令牌');
    expect(find.text('serenique_abc12345…'), findsOneWidget);
    expect(find.text('macbook'), findsOneWidget);

    // 新建
    await tester.tap(find.text('新建令牌'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'server');
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    expect(api.lastCreatedTokenName, 'server');
    expect(find.text('令牌已创建'), findsOneWidget);
    expect(find.text('serenique_xyz98765_明文仅此一次'), findsOneWidget);

    // 关闭弹窗 → 明文从树上消失（内存也随即清空，无法再次查看）
    await tester.tap(find.text('我已知晓，关闭'));
    await tester.pumpAndSettle();
    expect(find.text('serenique_xyz98765_明文仅此一次'), findsNothing);
  });

  testWidgets('API 令牌：撤销后显示已撤销标记', (tester) async {
    final api = _FakeAuthApi();
    await _pumpSettings(tester, api);
    await switchTab(tester, 'API 令牌');
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    expect(find.text('撤销 API 令牌'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '撤销'));
    await tester.pumpAndSettle();
    expect(api.revokeCalls, 1);
    expect(find.text('已撤销'), findsOneWidget);
  });

  testWidgets('退出登录清除本地会话', (tester) async {
    final storage = FakeTokenStorage('sess123');
    final api = _FakeAuthApi();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(storage),
        authApiProvider.overrideWithValue(api),
      ],
      child: const MaterialApp(home: SettingsPage()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('退出登录'));
    await tester.pumpAndSettle();
    expect(storage.value, isNull);
    expect(find.text('未登录'), findsOneWidget);
  });
}
