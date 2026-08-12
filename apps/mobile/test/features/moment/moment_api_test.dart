import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/moment/moment_api.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.body);
  final String body;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    body,
    200,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// 记录最近一次请求的 body 与 query（JSON 请求时 options.data 是 Map，需 jsonEncode）。
class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.onRequest);

  final String Function(RequestOptions options) onRequest;
  String? lastBody;
  Map<String, dynamic>? lastQuery;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final data = options.data;
    if (data is Map<String, dynamic>) {
      lastBody = jsonEncode(data);
    }
    lastQuery = options.queryParameters;
    return ResponseBody.fromString(
      onRequest(options),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(String baseUrl, String body) => ApiClient(
  baseUrl: baseUrl,
  tokenReader: () => null,
  dio: Dio(BaseOptions(baseUrl: baseUrl))
    ..httpClientAdapter = _FakeAdapter(body),
);

void main() {
  test('createBlobAccessLink 用相对 path + apiBase 拼接（路由反代前缀保留）', () async {
    final client = _client(
      'https://api.hcyj.xyz/serenique/',
      jsonEncode({
        'success': true,
        'message': '生成成功',
        'data': {
          'path': '/api/blobs/b1/file?expires=2100000000&signature=sig',
          'url':
              'https://api.hcyj.xyz/api/blobs/b1/file?expires=2100000000&signature=sig',
          'expires': 2100000000,
          'expiresAt': 't',
          'signature': 'sig',
        },
      }),
    );

    final api = MomentApi(client);
    final link = await api.createBlobAccessLink('b1');

    // 路由反代下必须带 /serenique 前缀，不能直接用后端返回的 url（丢前缀）
    expect(
      link.url,
      'https://api.hcyj.xyz/serenique/api/blobs/b1/file?expires=2100000000&signature=sig',
    );
    expect(link.expiresAt.millisecondsSinceEpoch, 2100000000 * 1000);
    expect(link.isExpired, isFalse);
  });

  test('createBlobAccessLink 无前缀 baseUrl 时拼接正确', () async {
    final client = _client(
      'https://api.zeroicey.me',
      jsonEncode({
        'success': true,
        'message': '生成成功',
        'data': {
          'path': '/api/blobs/b2/file?expires=2100000000&signature=sig2',
          'url':
              'https://api.zeroicey.me/api/blobs/b2/file?expires=2100000000&signature=sig2',
          'expires': 2100000000,
          'expiresAt': 't',
          'signature': 'sig2',
        },
      }),
    );

    final api = MomentApi(client);
    final link = await api.createBlobAccessLink('b2');
    expect(
      link.url,
      'https://api.zeroicey.me/api/blobs/b2/file?expires=2100000000&signature=sig2',
    );
  });

  test('uploadBlob 走 multipart 并解析 BlobEntry', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 'b1',
          'originalName': 'a.jpg',
          'mimeType': 'image/jpeg',
          'size': 3,
          'checksum': 'x',
          'metadata': {},
          'width': 1,
          'height': 1,
          'duration': null,
          'createdAt': 't',
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    final blob = await MomentApi(client).uploadBlob(
      Uint8List.fromList([1, 2, 3]),
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
    );
    expect(blob.id, 'b1');
    expect(blob.mimeType, 'image/jpeg');
  });

  test('create 带 attachments 时请求体包含 blobId/displayName/sortOrder', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 'm1',
          'text': '看图',
          'attachments': [],
          'comments': [],
          'commentCount': 0,
          'createdAt': 't',
          'updatedAt': 't',
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    await MomentApi(client).create(
      '看图',
      attachments: [
        MomentAttachmentInput(blobId: 'b1', displayName: 'a.jpg', sortOrder: 0),
      ],
    );
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['text'], '看图');
    expect((body['attachments'] as List).single, {
      'blobId': 'b1',
      'displayName': 'a.jpg',
      'sortOrder': 0,
    });
  });

  test('create 无附件时请求体不含 attachments 键', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 'm2',
          'text': '纯文字',
          'attachments': [],
          'comments': [],
          'commentCount': 0,
          'createdAt': 't',
          'updatedAt': 't',
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    await MomentApi(client).create('纯文字');
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['text'], '纯文字');
    expect(body.containsKey('attachments'), isFalse);
    expect(body.containsKey('location'), isFalse);
  });

  test('create 带 location 时请求体包含位置对象', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 'm3',
          'text': '带位置',
          'attachments': [],
          'comments': [],
          'commentCount': 0,
          'createdAt': 't',
          'updatedAt': 't',
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    await MomentApi(client).create(
      '带位置',
      location:
          const MomentLocation(name: '星巴克', latitude: 39.9827, longitude: 116.3162),
    );
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['location'], {
      'name': '星巴克',
      'latitude': 39.9827,
      'longitude': 116.3162,
    });
  });

  test('Moment.fromJson 解析响应里的 location', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 'm4',
          'text': '带位置',
          'location': {'name': '公园', 'latitude': 39.9, 'longitude': 116.4},
          'attachments': [],
          'comments': [],
          'commentCount': 0,
          'createdAt': 't',
          'updatedAt': 't',
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    final m = await MomentApi(client).create('带位置');
    expect(m.location, isNotNull);
    expect(m.location!.name, '公园');
    expect(m.location!.longitude, 116.4);
  });

  test('listPage：query 非空时拼 q，返回 items + total', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'items': [
            {
              'id': 'm1',
              'text': '北京 meeting',
              'attachments': [],
              'comments': [],
              'commentCount': 0,
              'createdAt': 't',
              'updatedAt': 't',
            },
          ],
          'total': 42,
        },
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    final page = await MomentApi(client).listPage(query: '  beijing  ');
    expect(page.items.single.text, '北京 meeting');
    expect(page.total, 42);
    expect(adapter.lastQuery, {
      'page': 1,
      'pageSize': 50,
      'q': 'beijing', // trim 后拼入
    });
  });

  test('listPage：query 空白时不含 q 参数', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {'items': [], 'total': 0},
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    final page = await MomentApi(client).listPage(query: '   ');
    expect(page.total, 0);
    expect(adapter.lastQuery, {'page': 1, 'pageSize': 50}); // 无 q 键
  });
}
