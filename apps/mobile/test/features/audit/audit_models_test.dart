import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/audit/audit_models.dart';

void main() {
  group('AuditLevel', () {
    test('中文标签', () {
      expect(AuditLevel.info.label, '信息');
      expect(AuditLevel.warn.label, '警告');
      expect(AuditLevel.error.label, '错误');
    });

    test('fromWire 解析后端值；未知兜底 info', () {
      expect(AuditLevel.fromWire('info'), AuditLevel.info);
      expect(AuditLevel.fromWire('warn'), AuditLevel.warn);
      expect(AuditLevel.fromWire('error'), AuditLevel.error);
      expect(AuditLevel.fromWire('debug'), AuditLevel.info);
      expect(AuditLevel.fromWire(null), AuditLevel.info);
    });
  });

  group('AuditLogEntry.fromJson', () {
    test('解析全部字段', () {
      final e = AuditLogEntry.fromJson({
        'id': 'a1',
        'event': 'auth.login',
        'message': '登录成功',
        'level': 'info',
        'source': 'mobile',
        'ip': '1.2.3.4',
        'detail': {'userId': 'u1'},
        'isRead': false,
        'createdAt': '2026-08-08T10:00:00Z',
      });
      expect(e.id, 'a1');
      expect(e.event, 'auth.login');
      expect(e.message, '登录成功');
      expect(e.level, AuditLevel.info);
      expect(e.source, 'mobile');
      expect(e.ip, '1.2.3.4');
      expect(e.detail, {'userId': 'u1'});
      expect(e.isRead, isFalse);
      expect(e.createdAt, '2026-08-08T10:00:00Z');
    });

    test('可选字段缺省：source/ip/detail 为 null，isRead 为 false，level 兜底 info', () {
      final e = AuditLogEntry.fromJson({
        'id': 'a2',
        'event': 'blob.delete',
        'message': '删除文件',
        'createdAt': 't',
      });
      expect(e.level, AuditLevel.info);
      expect(e.source, isNull);
      expect(e.ip, isNull);
      expect(e.detail, isNull);
      expect(e.isRead, isFalse);
    });

    test('level 解析 warn/error', () {
      final warn = AuditLogEntry.fromJson({
        'id': 'a3',
        'event': 'x',
        'message': 'm',
        'level': 'warn',
        'createdAt': 't',
      });
      expect(warn.level, AuditLevel.warn);

      final err = AuditLogEntry.fromJson({
        'id': 'a4',
        'event': 'x',
        'message': 'm',
        'level': 'error',
        'createdAt': 't',
      });
      expect(err.level, AuditLevel.error);
    });

    test('detail 非 map 时兜底为 null', () {
      final e = AuditLogEntry.fromJson({
        'id': 'a5',
        'event': 'x',
        'message': 'm',
        'detail': 'not-a-map',
        'createdAt': 't',
      });
      expect(e.detail, isNull);
    });
  });

  group('AuditLogPage.fromJson', () {
    test('解析 items + total', () {
      final page = AuditLogPage.fromJson({
        'total': 1,
        'items': [
          {'id': 'a1', 'event': 'e', 'message': 'm', 'createdAt': 't'},
        ],
      });
      expect(page.total, 1);
      expect(page.items.single.id, 'a1');
    });

    test('items 缺省为空、total 缺省为 0', () {
      final page = AuditLogPage.fromJson({'total': 0});
      expect(page.items, isEmpty);
      expect(page.total, 0);
    });
  });
}
