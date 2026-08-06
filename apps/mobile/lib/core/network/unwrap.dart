import 'api_exception.dart';

/// 统一响应解包。成功时返回 data，失败抛 ApiException。
dynamic unwrapResponse(Object? body) {
  if (body is! Map<String, dynamic>) {
    throw const ApiException('BAD_RESPONSE', '响应格式错误');
  }
  final success = body['success'];
  if (success != true) {
    final code = body['code'] as String? ?? 'API_ERROR';
    final message = body['message'] as String? ?? '请求失败';
    throw ApiException(code, message);
  }
  return body['data'];
}

/// 把分页对象 {items,total} 或裸数组解成条目列表。
List<dynamic> unwrapItems(dynamic data) {
  if (data is Map<String, dynamic>) {
    return data['items'] as List<dynamic>? ?? [];
  }
  if (data is List<dynamic>) return data;
  return [];
}
