import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/core/network/unwrap.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    body,
    statusCode,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// 把 options 交给回调构造响应，便于断言请求头/请求体。
class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.onRequest);

  final String Function(RequestOptions options) onRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    onRequest(options),
    200,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// 可定制响应头（Set-Cookie 测试用）。
class _HeaderAdapter implements HttpClientAdapter {
  _HeaderAdapter(this.body, this.headers);
  final String body;
  final Map<String, List<String>> headers;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(body, 200, headers: headers);

  @override
  void close({bool force = false}) {}
}

void main() {
  group('applySessionCookie', () {
    test('有 session：注入 Cookie 头', () {
      final options = RequestOptions(path: '/api/moments');
      applySessionCookie(options, () => 'abc.def');
      expect(options.headers['Cookie'], 'serenique_session=abc.def');
    });

    test('无 session：不加头', () {
      final options = RequestOptions(path: '/api/moments');
      applySessionCookie(options, () => null);
      expect(options.headers.containsKey('Cookie'), isFalse);
    });

    test('空 session：不加头', () {
      final options = RequestOptions(path: '/api/moments');
      applySessionCookie(options, () => '');
      expect(options.headers.containsKey('Cookie'), isFalse);
    });
  });

  group('sessionCookieFrom（Set-Cookie 捕获）', () {
    Response<dynamic> res(List<String> cookies) => Response(
          requestOptions: RequestOptions(path: '/'),
          statusCode: 200,
          data: const {'success': true, 'data': {}},
          headers: Headers.fromMap({'set-cookie': cookies}),
        );

    test('取 serenique_session 值，忽略 HttpOnly/Secure/Partitioned 属性', () {
      final r = res([
        'serenique_session=eyJ1c2VySWQiOiJ4In0.sig; Max-Age=2592000; Path=/; HttpOnly; Secure; Partitioned',
      ]);
      expect(
        sessionCookieFrom(r),
        'eyJ1c2VySWQiOiJ4In0.sig',
      );
    });

    test('多个 Set-Cookie 只取目标 cookie', () {
      final r = res([
        'other=1; Path=/',
        'serenique_session=v2; Path=/',
      ]);
      expect(sessionCookieFrom(r), 'v2');
    });

    test('无 Set-Cookie 头 → null', () {
      final r = Response(
        requestOptions: RequestOptions(path: '/'),
        statusCode: 200,
        data: const {'success': true, 'data': {}},
      );
      expect(sessionCookieFrom(r), isNull);
    });
  });

  group('ApiException.fromDioException', () {
    DioException dio(DioExceptionType type, {Response? response}) =>
        DioException(
          requestOptions: RequestOptions(path: '/'),
          type: type,
          response: response,
        );

    test('超时 → TIMEOUT', () {
      expect(
        ApiException.fromDioException(
          dio(DioExceptionType.connectionTimeout),
        ).code,
        'TIMEOUT',
      );
    });

    test('连接失败 → NETWORK', () {
      expect(
        ApiException.fromDioException(
          dio(DioExceptionType.connectionError),
        ).code,
        'NETWORK',
      );
    });

    test('badResponse：透传后端 code/message', () {
      final e = dio(
        DioExceptionType.badResponse,
        response: Response(
          requestOptions: RequestOptions(path: '/'),
          statusCode: 404,
          data: {'success': false, 'code': 'NOT_FOUND', 'message': '闪记不存在'},
        ),
      );
      final ae = ApiException.fromDioException(e);
      expect(ae.code, 'NOT_FOUND');
      expect(ae.message, '闪记不存在');
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
        401,
        jsonEncode({
          'success': false,
          'code': 'UNAUTHORIZED',
          'message': '未认证或登录已过期',
        }),
      );
      var called = false;
      final client = ApiClient(
        baseUrl: 'http://x',
        sessionReader: () => null,
        onUnauthorized: () async => called = true,
        dio: dio,
      );
      await expectLater(
        client.getData('/api/auth/me'),
        throwsA(isA<ApiException>()),
      );
      expect(called, isTrue);
    });

    test('非 401 不触发回调', () async {
      final dio = Dio();
      dio.httpClientAdapter = _FakeAdapter(
        500,
        jsonEncode({'success': false, 'code': 'INTERNAL', 'message': '服务错误'}),
      );
      var called = false;
      final client = ApiClient(
        baseUrl: 'http://x',
        sessionReader: () => null,
        onUnauthorized: () async => called = true,
        dio: dio,
      );
      await expectLater(
        client.getData('/api/moments'),
        throwsA(isA<ApiException>()),
      );
      expect(called, isFalse);
    });
  });

  test('postRaw：返回原始响应，可读 Set-Cookie（登录 finish 用）', () async {
    final dio = Dio();
    dio.httpClientAdapter = _HeaderAdapter(
      jsonEncode({'success': true, 'message': '登录成功', 'data': {'authenticated': true}}),
      {
        Headers.contentTypeHeader: ['application/json'],
        'set-cookie': ['serenique_session=v9; Path=/; HttpOnly; Secure'],
      },
    );
    final client = ApiClient(
      baseUrl: 'http://x',
      sessionReader: () => null,
      dio: dio,
    );
    final res = await client.postRaw('/api/auth/login/finish', body: {});
    expect(sessionCookieFrom(res), 'v9');
    expect(unwrapResponse(res.data), {'authenticated': true});
  });

  test('postMultipart 发送 multipart/form-data 并解包响应', () async {
    final captured = <String>[];
    final adapter = _RecordingAdapter((options) {
      // dio 5.11: RequestOptions.contentType 只是 header 字符串，需自行解析
      final header =
          options.headers[Headers.contentTypeHeader] as String? ?? '';
      final mediaType = header.isEmpty ? null : DioMediaType.parse(header);
      captured.add(mediaType?.mimeType ?? '');
      captured.add(
        mediaType?.parameters['boundary'] != null
            ? 'has-boundary'
            : 'no-boundary',
      );
      return jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {'id': 'b1'},
      });
    });
    final client = ApiClient(
      baseUrl: 'https://api.test',
      sessionReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    final data = await client.postMultipart(
      '/api/blobs/upload',
      bytes: Uint8List.fromList([1, 2, 3]),
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
    );
    expect((data as Map)['id'], 'b1');
    expect(captured[0], 'multipart/form-data');
    expect(captured[1], 'has-boundary');
  });

  test('postMultipart 超时对齐 Web（send/receive 300s）', () async {
    Duration? sendTimeout;
    Duration? receiveTimeout;
    final adapter = _RecordingAdapter((options) {
      sendTimeout = options.sendTimeout;
      receiveTimeout = options.receiveTimeout;
      return jsonEncode({
        'success': true,
        'message': 'ok',
        'data': {'id': 'b1'},
      });
    });
    final client = ApiClient(
      baseUrl: 'https://api.test',
      sessionReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
    await client.postMultipart(
      '/api/blobs/upload',
      bytes: Uint8List.fromList([1]),
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
    );
    expect(sendTimeout, const Duration(seconds: 300));
    expect(receiveTimeout, const Duration(seconds: 300));
  });
}
