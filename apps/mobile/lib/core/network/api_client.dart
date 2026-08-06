import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers.dart';
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
  ApiClient({required this.baseUrl, required String? Function() tokenReader})
      // ignore: prefer_initializing_formals
      : _tokenReader = tokenReader;

  final String baseUrl;
  final String? Function() _tokenReader;

  late final Dio _dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  )..interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        applyAuthHeader(options, _tokenReader);
        handler.next(options);
      },
    ));

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
      throw ApiException.fromDioException(e);
    }
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authTokenProvider),
  );
});
