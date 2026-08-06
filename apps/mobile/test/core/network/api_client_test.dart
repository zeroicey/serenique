import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';

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
}
