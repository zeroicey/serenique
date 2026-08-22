import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/blob/blob_api.dart';

/// 假 ApiClient：捕获请求（path/query/body），按 handler 返回预置 data。
/// 不真正发起网络请求。
class _FakeApiClient extends ApiClient {
  _FakeApiClient({required this.handler})
      : super(baseUrl: 'http://x', tokenReader: () => null);

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
  Future<dynamic> postData(String path, {Object? body}) async {
    lastPath = path;
    lastBody = body;
    return handler('POST', path, body: body);
  }

  @override
  Future<dynamic> deleteData(String path) async {
    lastPath = path;
    return handler('DELETE', path);
  }
}

const _entry = {
  'id': 'b1',
  'originalName': 'a.png',
  'mimeType': 'image/png',
  'size': 3,
  'checksum': 'x',
  'metadata': <String, dynamic>{},
  'width': 10,
  'height': 10,
  'duration': null,
  'createdAt': '2026-08-05T00:00:00.000Z',
  'refCount': 0,
};

void main() {
  group('BlobApi.list', () {
    test('透传分页与 mimeType 前缀过滤，解析 items/total', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'items': [_entry, {..._entry, 'id': 'b2', 'mimeType': 'application/pdf'}],
          'total': 2,
        },
      );
      final api = BlobApi(client);

      final page = await api.list(page: 2, pageSize: 48, mimeType: 'image/');

      expect(client.lastPath, '/api/blobs');
      expect(client.lastQuery, {'page': 2, 'pageSize': 48, 'mimeType': 'image/'});
      expect(page.items, hasLength(2));
      expect(page.total, 2);
      expect(page.items.first.refCount, 0);
      expect(page.items.last.isImage, isFalse);
    });

    test('mimeType 为 null 时不带该参数', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'items': <dynamic>[],
          'total': 0,
        },
      );
      final api = BlobApi(client);

      await api.list(page: 1, pageSize: 48);

      expect(client.lastQuery, {'page': 1, 'pageSize': 48});
    });
  });

  group('BlobApi.listAttachments', () {
    test('解析引用列表', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => [
          {
            'id': 'a1',
            'blobId': 'b1',
            'ownerType': 'moment',
            'ownerId': 'm1',
            'role': 'attachment',
            'displayName': null,
            'sortOrder': 0,
            'createdAt': 't',
            'updatedAt': 't',
          },
        ],
      );
      final api = BlobApi(client);

      final refs = await api.listAttachments('b1');

      expect(client.lastPath, '/api/blobs/b1/attachments');
      expect(refs, hasLength(1));
      expect(refs.first.ownerType, 'moment');
    });

    test('空引用返回空列表', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => <dynamic>[],
      );
      final api = BlobApi(client);

      expect(await api.listAttachments('b1'), isEmpty);
    });
  });

  group('BlobApi.delete', () {
    test('local 204 无 body → 空 deleteUrls', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => null,
      );
      final api = BlobApi(client);

      final result = await api.delete('b1');

      expect(client.lastPath, '/api/blobs/b1');
      expect(result.deleted, isTrue);
      expect(result.deleteUrls, isEmpty);
    });

    test('r2 200 → 解包 data.deleteUrls（原图+缩略图）', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'deleted': true,
          'deleteUrls': [
            'https://s3.0icey.icu/image/2026/08/b1.png?e=1&s=abc',
            'https://s3.0icey.icu/image/2026/08/b1.png.thumb.webp?e=1&s=def',
          ],
        },
      );
      final api = BlobApi(client);

      final result = await api.delete('b1');

      expect(client.lastPath, '/api/blobs/b1');
      expect(result.deleted, isTrue);
      expect(result.deleteUrls, hasLength(2));
      expect(result.deleteUrls.first, startsWith('https://s3.0icey.icu/'));
    });

    test('被引用 409 → ApiException 透传中文 message', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async {
          throw ApiException(
            'CONFLICT',
            '文件仍被业务记录引用，请先删除关联',
            statusCode: 409,
          );
        },
      );
      final api = BlobApi(client);

      await expectLater(
        api.delete('b1'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 409)
              .having((e) => e.message, 'message', contains('引用')),
        ),
      );
    });
  });

  group('BlobApi.createBlobAccessLink', () {
    test('R2 直链（绝对 URL path 原样返回）', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'path': 'https://s3.0icey.icu/image/2026/08/b1.png?e=1&s=abc',
          'expires': 1787_000_000,
          'signature': 'sig',
        },
      );
      final api = BlobApi(client);

      final link = await api.createBlobAccessLink('b1');

      expect(client.lastPath, '/api/blobs/b1/access-link');
      expect(link.url, startsWith('https://s3.0icey.icu/'));
    });

    test('相对 path（本地代理）拼 apiBase', () async {
      final client = _FakeApiClient(
        handler: (method, path, {query, body}) async => {
          'path': '/api/blobs/b1/file?e=1&s=abc',
          'expires': 1787_000_000,
        },
      );
      final api = BlobApi(client);

      final link = await api.createBlobAccessLink('b1');

      expect(link.url, 'http://x/api/blobs/b1/file?e=1&s=abc');
    });
  });
}