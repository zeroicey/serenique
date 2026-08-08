import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/moment/moment_api.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.body);
  final String body;

  @override
  Future<ResponseBody> fetch(RequestOptions options,
          Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromString(body, 200,
          headers: {Headers.contentTypeHeader: ['application/json']});

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
    final client = _client('https://api.hcyj.xyz/serenique/', jsonEncode({
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
    }));

    final api = MomentApi(client);
    final link = await api.createBlobAccessLink('b1');

    // 路由反代下必须带 /serenique 前缀，不能直接用后端返回的 url（丢前缀）
    expect(link.url,
        'https://api.hcyj.xyz/serenique/api/blobs/b1/file?expires=2100000000&signature=sig');
    expect(link.expiresAt.millisecondsSinceEpoch, 2100000000 * 1000);
    expect(link.isExpired, isFalse);
  });

  test('createBlobAccessLink 无前缀 baseUrl 时拼接正确', () async {
    final client = _client('https://api.zeroicey.me', jsonEncode({
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
    }));

    final api = MomentApi(client);
    final link = await api.createBlobAccessLink('b2');
    expect(link.url,
        'https://api.zeroicey.me/api/blobs/b2/file?expires=2100000000&signature=sig2');
  });
}
