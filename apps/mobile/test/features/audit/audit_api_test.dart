import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/audit/audit_api.dart';

/// 假 ApiClient：捕获请求（path/query/body），按 handler 返回预置 data。
/// 不真正发起网络请求。
class _FakeApiClient extends ApiClient {
  _FakeApiClient({required this.handler})
      : super(baseUrl: 'http://x', sessionReader: () => null);

  final Future<Object?> Function(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? body,
  }) handler;

  String? lastPath;
  Map<String, dynamic>? lastQuery;
  Object? lastBody;

  @override
  Future<dynamic> getData(String path, {Map<String, dynamic>? query}) async {
    lastPath = path;
    lastQuery = query;
    return handler('GET', path, query: query);
  }

  @override
  Future<dynamic> putData(String path, {Object? body}) async {
    lastPath = path;
    lastBody = body;
    return handler('PUT', path, body: body);
  }
}

void main() {
  group('AuditApi.list', () {
    test('透传过滤参数并解析分页对象', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'items': [
            {
              'id': 'a1',
              'event': 'auth.login',
              'message': '登录成功',
              'level': 'info',
              'createdAt': 't',
            },
          ],
          'total': 1,
        },
      );
      final api = AuditApi(client);

      final page = await api.list(
        page: 2,
        pageSize: 10,
        level: 'warn',
        event: 'auth.login_failed',
        unreadOnly: true,
      );

      expect(client.lastPath, '/api/audit/logs');
      expect(client.lastQuery, {
        'page': 2,
        'pageSize': 10,
        'level': 'warn',
        'event': 'auth.login_failed',
        'unreadOnly': 'true',
      });
      expect(page.total, 1);
      expect(page.items.single.message, '登录成功');
      expect(page.items.single.level.name, 'info');
    });

    test('缺省参数：不带 level/event/unreadOnly，默认 page/pageSize', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'items': <Object>[],
          'total': 0,
        },
      );
      final api = AuditApi(client);

      await api.list();

      expect(client.lastQuery, containsPair('page', 1));
      expect(client.lastQuery, containsPair('pageSize', 50));
      expect(client.lastQuery!.containsKey('level'), isFalse);
      expect(client.lastQuery!.containsKey('event'), isFalse);
      // unreadOnly=false 时不带该参数（避免后端把 "false" coerce 成 true）
      expect(client.lastQuery!.containsKey('unreadOnly'), isFalse);
    });
  });

  group('AuditApi.unreadCount', () {
    test('解析 unreadCount', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {'unreadCount': 5},
      );
      final api = AuditApi(client);

      expect(await api.unreadCount(), 5);
      expect(client.lastPath, '/api/audit/logs/unread-count');
    });

    test('unreadCount 缺省兜底 0', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => <String, Object?>{},
      );
      final api = AuditApi(client);

      expect(await api.unreadCount(), 0);
    });
  });

  group('AuditApi.markRead', () {
    test('带 ids → body { ids }，解析 updatedCount/unreadCount', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'updatedCount': 2,
          'unreadCount': 0,
        },
      );
      final api = AuditApi(client);

      final result = await api.markRead(ids: ['a1', 'a2']);

      expect(client.lastPath, '/api/audit/logs/read');
      expect(client.lastBody, {'ids': ['a1', 'a2']});
      expect(result.updatedCount, 2);
      expect(result.unreadCount, 0);
    });

    test('ids 缺省或为空 → body {}（全部置已读）', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'updatedCount': 0,
          'unreadCount': 0,
        },
      );
      final api = AuditApi(client);

      await api.markRead();
      expect(client.lastBody, <String, dynamic>{});

      await api.markRead(ids: const []);
      expect(client.lastBody, <String, dynamic>{});
    });
  });
}
