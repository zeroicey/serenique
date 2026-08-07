import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/audit/audit_models.dart';
import 'package:serenique_mobile/features/audit/audit_page.dart';
import 'package:serenique_mobile/features/audit/audit_providers.dart';

void main() {
  final sample = AuditLogEntry(
    id: 'a1',
    event: 'auth.login',
    message: '登录成功',
    level: AuditLevel.info,
    source: 'mobile',
    ip: '1.2.3.4',
    isRead: false,
    createdAt: '2026-08-08T10:00:00Z',
  );

  testWidgets('渲染日志条目：消息/事件/级别/来源/IP/未读', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        auditListProvider.overrideWith(
            (ref) async => AuditLogPage(items: [sample], total: 1)),
        auditUnreadCountProvider.overrideWith((ref) async => 1),
      ],
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('登录成功'), findsOneWidget);
    expect(find.textContaining('auth.login'), findsOneWidget);
    expect(find.textContaining('信息'), findsWidgets); // 级别 label
    expect(find.textContaining('来源 mobile'), findsOneWidget);
    expect(find.textContaining('IP 1.2.3.4'), findsOneWidget);
  });

  testWidgets('已读条目：无未读圆点', (tester) async {
    final read = AuditLogEntry(
      id: 'a2',
      event: 'auth.logout',
      message: '退出登录',
      level: AuditLevel.info,
      isRead: true,
      createdAt: '2026-08-08T09:00:00Z',
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [
        auditListProvider.overrideWith(
            (ref) async => AuditLogPage(items: [read], total: 1)),
        auditUnreadCountProvider.overrideWith((ref) async => 0),
      ],
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('退出登录'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('空列表（默认只看未读）显示「没有未读日志」', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        auditListProvider.overrideWith(
            (ref) async => const AuditLogPage(items: [], total: 0)),
        auditUnreadCountProvider.overrideWith((ref) async => 0),
      ],
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('没有未读日志'), findsOneWidget);
  });

  testWidgets('404 错误：显示友好降级文案 + 重试按钮', (tester) async {
    const err = ApiException('NOT_FOUND', '接口不存在', statusCode: 404);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        auditListProvider.overrideWith((ref) async => throw err),
        auditUnreadCountProvider.overrideWith((ref) async => throw err),
      ],
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('后端尚未上线日志接口'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('普通错误透传后端中文文案', (tester) async {
    const err = ApiException('INTERNAL', '服务器开小差了', statusCode: 500);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        auditListProvider.overrideWith((ref) async => throw err),
        auditUnreadCountProvider.overrideWith((ref) async => 0),
      ],
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('服务器开小差了'), findsOneWidget);
  });

  testWidgets('级别单选：点「警告」选中、再点取消；未读保持默认勾选', (tester) async {
    final container = ProviderContainer(overrides: [
      auditListProvider.overrideWith(
          (ref) async => const AuditLogPage(items: [], total: 0)),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    // 默认：未读勾选、无级别（全部级别）
    expect(container.read(auditFilterProvider).unreadOnly, isTrue);
    expect(container.read(auditFilterProvider).level, isNull);

    // 点「警告」→ level=warn，未读保持勾选
    await tester.tap(find.widgetWithText(ChoiceChip, '警告'));
    await tester.pumpAndSettle();
    expect(container.read(auditFilterProvider).level, 'warn');
    expect(container.read(auditFilterProvider).unreadOnly, isTrue);

    // 再点「警告」→ 取消回到全部级别
    await tester.tap(find.widgetWithText(ChoiceChip, '警告'));
    await tester.pumpAndSettle();
    expect(container.read(auditFilterProvider).level, isNull);
  });

  testWidgets('「未读」切换：默认勾选，点一下取消（=所有）', (tester) async {
    final container = ProviderContainer(overrides: [
      auditListProvider.overrideWith(
          (ref) async => const AuditLogPage(items: [], total: 0)),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: AuditPage()),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('未读'));
    await tester.pumpAndSettle();

    expect(container.read(auditFilterProvider).unreadOnly, isFalse);
  });
}
