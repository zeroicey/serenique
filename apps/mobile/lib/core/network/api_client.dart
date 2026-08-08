import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/auth_providers.dart';
import '../config.dart';
import 'api_exception.dart';
import 'unwrap.dart';

/// 给请求头注入 Bearer token；无 token 时不动。
void applyAuthHeader(RequestOptions options, String? Function() tokenReader) {
  final token = tokenReader();
  if (token != null && token.isNotEmpty) {
    options.headers['Authorization'] = 'Bearer $token';
  }
}

/// 全局单例 HTTP 客户端：统一 baseUrl、统一解包、token 注入位、异常映射。
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required String? Function() tokenReader,
    this.onUnauthorized,
    Dio? dio,
  })
      // ignore: prefer_initializing_formals
      : _tokenReader = tokenReader {
    _dio = dio ??
        Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        applyAuthHeader(options, _tokenReader);
        handler.next(options);
      },
    ));
  }

  final String baseUrl;
  final String? Function() _tokenReader;
  final Future<void> Function()? onUnauthorized;
  late final Dio _dio;

  /// 归一化 baseUrl：去掉尾斜杠，供媒体 URL 拼接（dio 对路径拼接宽容，媒体 URL 直接走网络层）。
  String get apiBase =>
      baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

  Future<dynamic> getData(String path, {Map<String, dynamic>? query}) =>
      _guard(_dio.get(path, queryParameters: query));

  Future<dynamic> postData(String path, {Object? body}) =>
      _guard(_dio.post(path, data: body));

  Future<dynamic> putData(String path, {Object? body}) =>
      _guard(_dio.put(path, data: body));

  Future<dynamic> deleteData(String path) => _guard(_dio.delete(path));

  Future<dynamic> _guard(Future<Response<dynamic>> future) async {
    try {
      final res = await future;
      return unwrapResponse(res.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await onUnauthorized?.call();
      }
      throw ApiException.fromDioException(e);
    }
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authControllerProvider).token,
    onUnauthorized: () async {
      try {
        await ref.read(authControllerProvider.notifier).logout();
      } catch (_) {
        // 存储异常不应掩盖原始的 401 ApiException
      }
    },
  );
});
