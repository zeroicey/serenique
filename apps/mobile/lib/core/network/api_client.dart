import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/auth_providers.dart';
import '../config.dart';
import 'api_exception.dart';
import 'unwrap.dart';

/// 会话 cookie 名（对齐服务端 auth.domain 的 serenique_session）。
const String sessionCookieName = 'serenique_session';

/// 给请求头注入会话 cookie；无会话时不动。
void applySessionCookie(RequestOptions options, String? Function() sessionReader) {
  final session = sessionReader();
  if (session != null && session.isNotEmpty) {
    options.headers['Cookie'] = '$sessionCookieName=$session';
  }
}

/// 从响应头的 Set-Cookie 中提取 [sessionCookieName] 的值。
///
/// 原生客户端没有浏览器 cookie 语义，HttpOnly/Secure/Partitioned 等属性直接忽略，
/// 只取 name=value。dio 的 headers 是 `List<String>`。
String? sessionCookieFrom(Response<dynamic> res) {
  final cookies = res.headers['set-cookie'];
  if (cookies == null || cookies.isEmpty) return null;
  for (final raw in cookies) {
    final nameValue = raw.split(';').first.trim();
    if (nameValue.startsWith('$sessionCookieName=')) {
      return nameValue.substring(sessionCookieName.length + 1);
    }
  }
  return null;
}

/// 全局单例 HTTP 客户端：统一 baseUrl、统一解包、会话 cookie 注入位、异常映射。
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required String? Function() sessionReader,
    this.onUnauthorized,
    Dio? dio,
  })
      // ignore: prefer_initializing_formals
      : _sessionReader = sessionReader {
    _dio = dio ??
        Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        applySessionCookie(options, _sessionReader);
        handler.next(options);
      },
    ));
  }

  final String baseUrl;
  final String? Function() _sessionReader;
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

  Future<dynamic> patchData(String path, {Object? body}) =>
      _guard(_dio.patch(path, data: body));

  Future<dynamic> deleteData(String path) => _guard(_dio.delete(path));

  /// 原始响应 POST：不统一解包，调用方自行 [unwrapResponse] 并读取响应头
  /// （如登录/注册 finish 的 Set-Cookie）。401 仍触发 [onUnauthorized]。
  Future<Response<dynamic>> postRaw(String path, {Object? body}) =>
      _rawGuard(_dio.post(path, data: body));

  /// 原始响应 DELETE：同 [postRaw]（204 无 body 端点用，不能走 unwrap）。
  Future<Response<dynamic>> deleteRaw(String path) =>
      _rawGuard(_dio.delete(path));

  /// multipart 文件上传（dio FormData + MultipartFile，bytes 已在内存）。
  /// 上传超时对齐 Web 端（300s）：大视频上传耗时远超默认 10s receiveTimeout。
  Future<dynamic> postMultipart(
    String path, {
    required Uint8List bytes,
    required String filename,
    required String mimeType,
  }) {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes,
          filename: filename, contentType: DioMediaType.parse(mimeType)),
    });
    return _guard(_dio.post(
      path,
      data: form,
      options: Options(
        connectTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 300),
        sendTimeout: const Duration(seconds: 300),
      ),
    ));
  }

  Future<dynamic> _guard(Future<Response<dynamic>> future) async {
    final res = await _rawGuard(future);
    return unwrapResponse(res.data);
  }

  Future<Response<dynamic>> _rawGuard(Future<Response<dynamic>> future) async {
    try {
      return await future;
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
    sessionReader: () => ref.read(authControllerProvider).session,
    onUnauthorized: () async {
      try {
        await ref.read(authControllerProvider.notifier).logout();
      } catch (_) {
        // 存储异常不应掩盖原始的 401 ApiException
      }
    },
  );
});
