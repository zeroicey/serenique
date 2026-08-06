import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  Future<ResponseBody> fetch(RequestOptions options,
          Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromString(body, statusCode,
          headers: {Headers.contentTypeHeader: ['application/json']});

  @override
  void close({bool force = false}) {}
}

void main() {
  group('applyAuthHeader', () {
    test('有 token：注入 Bearer', () {
      final options = RequestOptions(path: '/api/moments');
      applyAuthHeader(options, () => 'secret');
      expect(options.headers['Authorization'], 'Bearer secret');
    });

    test('无 token：不加头', () {
      final options = RequestOptions(path: '/api/moments');
      applyAuthHeader(options, () => null);
      expect(options.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('ApiException.fromDioException', () {
    DioException dio(DioExceptionType type, {Response? response}) =>
        DioException(requestOptions: RequestOptions(path: '/'), type: type, response: response);

    test('超时 → TIMEOUT', () {
      expect(ApiException.fromDioException(dio(DioExceptionType.connectionTimeout)).code, 'TIMEOUT');
    });

    test('连接失败 → NETWORK', () {
      expect(ApiException.fromDioException(dio(DioExceptionType.connectionError)).code, 'NETWORK');
    });

    test('badResponse：透传后端 code/message', () {
      final e = dio(DioExceptionType.badResponse, response: Response(
        requestOptions: RequestOptions(path: '/'),
        statusCode: 404,
        data: {'success': false, 'code': 'NOT_FOUND', 'message': '日记不存在'},
      ));
      final ae = ApiException.fromDioException(e);
      expect(ae.code, 'NOT_FOUND');
      expect(ae.message, '日记不存在');
      expect(ae.statusCode, 404);
    });
  });

  group('humanizeError', () {
    test('ApiException 透传 message', () {
      expect(humanizeError(const ApiException('X', '出错了')), '出错了');
    });

    test('其他异常 → 兜底文案', () {
      expect(humanizeError(StateError('boom')), '操作失败，请稍后重试');
    });
  });

  group('onUnauthorized', () {
    test('401 触发回调', () async {
      final dio = Dio();
      dio.httpClientAdapter = _FakeAdapter(
          401, jsonEncode({'success': false, 'code': 'UNAUTHORIZED', 'message': '未认证或登录已过期'}));
      var called = false;
      final client = ApiClient(
          baseUrl: 'http://x',
          tokenReader: () => null,
          onUnauthorized: () async => called = true,
          dio: dio);
      await expectLater(client.getData('/api/auth/me'), throwsA(isA<ApiException>()));
      expect(called, isTrue);
    });

    test('非 401 不触发回调', () async {
      final dio = Dio();
      dio.httpClientAdapter = _FakeAdapter(
          500, jsonEncode({'success': false, 'code': 'INTERNAL', 'message': '服务错误'}));
      var called = false;
      final client = ApiClient(
          baseUrl: 'http://x',
          tokenReader: () => null,
          onUnauthorized: () async => called = true,
          dio: dio);
      await expectLater(client.getData('/api/moments'), throwsA(isA<ApiException>()));
      expect(called, isFalse);
    });
  });
}
