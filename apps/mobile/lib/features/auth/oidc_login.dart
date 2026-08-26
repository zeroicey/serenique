import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../../core/config.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/unwrap.dart';

/// 回调自定义 scheme：必须与 Pocket ID 后台注册的 Callback URL、iOS
/// Info.plist 的 CFBundleURLTypes、Android Manifest 的 intent-filter 三处一致。
const _callbackScheme = 'serenique';

/// Pocket ID OIDC 登录（授权码 + PKCE，交换在服务端完成）。
///
/// 流程：
/// ① GET /api/auth/oidc/url —— 服务端生成 state/nonce/PKCE 并返回授权跳转地址；
/// ② 系统浏览器完成 Passkey 认证后回跳 `serenique://auth/callback?code=..&state=..&iss=..`；
/// ③ POST /api/auth/oidc/callback {query}（完整查询串原样透传，RFC 9207 iss 必须保留），
///    服务端验签后发会话 cookie（Set-Cookie）；
/// ④ 用会话 cookie 调 POST /api/tokens 铸一把移动端专用 Bearer token——
///    「认证中心管人，API token 管机器」，与 CLI 同模式，且不受会话 3 天 TTL 影响。
class OidcLoginResult {
  const OidcLoginResult({required this.bearerToken});

  final String bearerToken;
}

Future<OidcLoginResult> oidcSignIn() async {
  // 不走全局 ApiClient：登录前没有凭据，且第③步需要读 Set-Cookie 原始响应头。
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      validateStatus: (s) => s != null && s < 500, // 业务错误手动解包
    ),
  );

  // ① 取授权跳转地址（state/PKCE 登录态由服务端生成保存；target=mobile 让
  //    服务端用自定义 scheme 回调，而不是 Web 域名回调）
  final Response<dynamic> urlRes;
  try {
    urlRes = await dio.get(
      '/api/auth/oidc/url',
      queryParameters: {'target': 'mobile'},
    );
  } on DioException catch (e) {
    throw ApiException.fromDioException(e);
  }
  final authorizeUrl =
      unwrapResponse(urlRes.data)['authorizationUrl'] as String?;

  // ② 拉起系统浏览器；用户按 Passkey 后重定向回 app。用户取消时插件抛
  //    PlatformException(code: 'error')，转成业务取消提示。
  String callbackUrl;
  try {
    callbackUrl = await FlutterWebAuth2.authenticate(
      url: authorizeUrl!,
      callbackUrlScheme: _callbackScheme,
    );
  } on PlatformException catch (e) {
    if (e.code == 'error') {
      throw const ApiException('OIDC_CANCELLED', '已取消登录');
    }
    rethrow;
  }

  // ③ 完整查询串透传给服务端换会话 cookie（不能只挑 code+state，iss 必须保留）
  final uri = Uri.parse(callbackUrl);
  final query = uri.query.isEmpty ? uri.fragment : uri.query;
  final Response<dynamic> cbRes;
  try {
    cbRes = await dio.post('/api/auth/oidc/callback', data: {'query': query});
  } on DioException catch (e) {
    throw ApiException.fromDioException(e);
  }
  unwrapResponse(cbRes.data); // 失败在此抛 ApiException

  final cookies = cbRes.headers['set-cookie'];
  final sessionCookieValue = _extractSessionCookie(cookies ?? const []);
  if (sessionCookieValue == null) {
    throw const ApiException('BAD_RESPONSE', '未收到登录会话，请稍后重试');
  }

  // ④ 会话身份铸一把长期 Bearer token，此后与粘贴 token 同一通路。
  //    Cookie 头必须是完整名值对（中间件按 serenique_session= 匹配），
  //    不能只发裸值。
  final sessionCookie = 'serenique_session=$sessionCookieValue';

  // ④ 会话身份铸一把长期 Bearer token，此后与粘贴 token 同一通路
  final Response<dynamic> tokenRes;
  try {
    tokenRes = await dio.post(
      '/api/tokens',
      data: {'name': 'mobile-${defaultTargetPlatform.name}'},
      options: Options(headers: {'Cookie': sessionCookie}),
    );
  } on DioException catch (e) {
    throw ApiException.fromDioException(e);
  }
  final data = unwrapResponse(tokenRes.data) as Map<String, dynamic>;
  final plaintext = data['plaintext'] as String?;
  if (plaintext == null || plaintext.isEmpty) {
    throw const ApiException('BAD_RESPONSE', '令牌创建失败，请稍后重试');
  }
  return OidcLoginResult(bearerToken: plaintext);
}

/// 从 Set-Cookie 列表里提取 serenique_session 的值。
String? _extractSessionCookie(List<String> setCookies) {
  for (final c in setCookies) {
    if (!c.startsWith('serenique_session=')) continue;
    final value = c.substring('serenique_session='.length).split(';').first;
    if (value.isNotEmpty && value != '') return value;
  }
  return null;
}
