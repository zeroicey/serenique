import 'package:dio/dio.dart';

/// 统一 API 异常。code 对应后端错误码，message 已是中文，可直接展示。
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  /// 把 dio 网络层异常映射成业务异常。
  factory ApiException.fromDioException(DioException e) {
    final type = e.type;
    if (type == DioExceptionType.connectionTimeout ||
        type == DioExceptionType.sendTimeout ||
        type == DioExceptionType.receiveTimeout) {
      return const ApiException('TIMEOUT', '请求超时，请检查网络');
    }
    if (type == DioExceptionType.connectionError) {
      return const ApiException('NETWORK', '网络连接失败，请检查网络');
    }
    // 后端业务错误：badResponse，响应体已是统一结构
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final code = data['code'] as String? ?? 'API_ERROR';
      final message = data['message'] as String? ?? '请求失败';
      return ApiException(code, message, statusCode: e.response?.statusCode);
    }
    return const ApiException('UNKNOWN', '未知错误，请稍后重试');
  }

  @override
  String toString() => 'ApiException($code, $message)';
}

/// 面向用户的错误文案：业务错误透传后端中文消息，其余给兜底。
String humanizeError(Object e) =>
    e is ApiException ? e.message : '操作失败，请稍后重试';
