import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/tag/tag_api.dart';

/// 记录最近一次请求的 path/query/body；按构造的 status/body 返回响应。
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter({this.status = 200, this.body = ''});

  final int status;
  final String body;
  String? lastPath;
  Map<String, dynamic>? lastQuery;
  String? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastPath = options.path;
    lastQuery = options.queryParameters;
    final data = options.data;
    if (data is Map<String, dynamic>) lastBody = jsonEncode(data);
    return ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(_FakeAdapter adapter) => ApiClient(
  baseUrl: 'http://localhost',
  tokenReader: () => null,
  dio: Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = adapter,
);

void main() {
  test('list：解析 {items,total} ⇒ MomentTag 列表', () async {
    final adapter = _FakeAdapter(
      body: jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'items': [
            {
              'id': 't1',
              'name': '工作',
              'momentCount': 3,
              'createdAt': 'a',
              'updatedAt': 'b',
            },
            {
              'id': 't2',
              'name': '生活',
              'momentCount': 0,
              'createdAt': 'a',
              'updatedAt': 'b',
            },
          ],
          'total': 2,
        },
      }),
    );
    final tags = await TagApi(_client(adapter)).list();
    expect(tags.length, 2);
    expect(tags.first.id, 't1');
    expect(tags.first.name, '工作');
    expect(tags.first.momentCount, 3);
  });

  test('create：POST /api/tags body {name} → MomentTag', () async {
    final adapter = _FakeAdapter(
      body: jsonEncode({
        'success': true,
        'message': '创建成功',
        'data': {
          'id': 't9',
          'name': '读书',
          'momentCount': 0,
          'createdAt': 'a',
          'updatedAt': 'b',
        },
      }),
    );
    final tag = await TagApi(_client(adapter)).create('读书');
    expect(tag.id, 't9');
    expect(tag.name, '读书');
  });

  test('rename：PUT /api/tags/:id body {name}', () async {
    final adapter = _FakeAdapter(
      body: jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {
          'id': 't1',
          'name': '工作笔记',
          'momentCount': 3,
          'createdAt': 'a',
          'updatedAt': 'b',
        },
      }),
    );
    final tag = await TagApi(_client(adapter)).rename('t1', '工作笔记');
    expect(adapter.lastPath, '/api/tags/t1');
    expect(tag.name, '工作笔记');
    expect(tag.id, 't1');
  });

  test('delete：DELETE /api/tags/:id → 204 不抛错', () async {
    final adapter = _FakeAdapter(status: 204, body: '');
    await TagApi(_client(adapter)).delete('t1');
    expect(adapter.lastPath, '/api/tags/t1');
  });
}
