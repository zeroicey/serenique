import 'dart:typed_data';

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
    _dio =
        dio ??
        Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
          ),
        );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          applyAuthHeader(options, _tokenReader);
          handler.next(options);
        },
      ),
    );
  }

  final String baseUrl;
  final String? Function() _tokenReader;
  final Future<void> Function()? onUnauthorized;
  late final Dio _dio;

  /// 去尾斜杠的 base URL，用于拼接媒体直链等带 token 之外的 URL。
  String get apiBase => baseUrl.endsWith('/')
      ? baseUrl.substring(0, baseUrl.length - 1)
      : baseUrl;

  Future<dynamic> getData(String path, {Map<String, dynamic>? query}) =>
      _guard(_dio.get(path, queryParameters: query));

  Future<dynamic> postData(String path, {Object? body}) =>
      _guard(_dio.post(path, data: body));

  Future<dynamic> putData(String path, {Object? body}) =>
      _guard(_dio.put(path, data: body));

  Future<dynamic> deleteData(String path) => _guard(_dio.delete(path));

  /// multipart 文件上传（dio FormData + MultipartFile，bytes 已在内存）。
  /// 上传超时对齐 Web 端（300s）：大视频上传耗时远超默认 10s receiveTimeout。
  Future<dynamic> postMultipart(
    String path, {
    required Uint8List bytes,
    required String filename,
    required String mimeType,
  }) {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType.parse(mimeType),
      ),
    });
    return _guard(
      _dio.post(
        path,
        data: form,
        options: Options(
          connectTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 300),
          sendTimeout: const Duration(seconds: 300),
        ),
      ),
    );
  }

  Future<dynamic> _guard(Future<Response<dynamic>> future) async {
    try {
      final res = await future;
      // 204 No Content：后端删除接口无 body，跳过统一解包（否则空串抛 BAD_RESPONSE）。
      if (res.statusCode == 204) return null;
      return unwrapResponse(res.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await onUnauthorized?.call();
      }
      throw ApiException.fromDioException(e);
    }
  }

  /// r2 直传：PUT 二进制到绝对 URL（s3.0icey.icu 网关）。
  /// 用独立 Dio（无 interceptor）——避免把 Bearer token 发给网关域，且响应是纯状态码不是envelope。
  /// 返回 HTTP 状态码（成功 200；403/413 等直接返回，不抛）。
  Future<int> putBinary(
    String absoluteUrl,
    Uint8List bytes,
    String contentType,
  ) async {
    final raw = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 60),
        sendTimeout: const Duration(seconds: 300),
        receiveTimeout: const Duration(seconds: 300),
      ),
    );
    try {
      final res = await raw.put(
        absoluteUrl,
        data: bytes,
        options: Options(headers: {'Content-Type': contentType}),
      );
      return res.statusCode ?? 0;
    } on DioException catch (e) {
      return e.response?.statusCode ?? 0;
    }
  }

  /// r2 签名删除：DELETE 绝对 URL（s3.0icey.icu 网关，签名在 query 上）。
  /// 与 putBinary 同模式：独立 Dio（无 interceptor，不带 Bearer token），
  /// 只回状态码不抛（调用方 fire-and-forget，失败由孤儿清理兜底）。
  Future<int> deleteUrl(String absoluteUrl) async {
    final raw = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      ),
    );
    try {
      final res = await raw.delete(absoluteUrl);
      return res.statusCode ?? 0;
    } on DioException catch (e) {
      return e.response?.statusCode ?? 0;
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
