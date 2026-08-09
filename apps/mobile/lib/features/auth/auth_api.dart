import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';

// ---------------------------------------------------------------------------
// Auth 模块 API 契约（Passkey 时代，对齐 services/api 的 auth/tokens/users 模块）。
// 身份 = HttpOnly 会话 cookie（serenique_session），客户端手动注入 Cookie 头；
// 注册/登录走 WebAuthn 双段 ceremony（start → finish）。
// 字段命名以服务端 schema 为唯一事实来源，勿与服务端旧契约混用。
// ---------------------------------------------------------------------------

/// 个人信息（对齐 auth.types.ts 的 UserEntry；时间为 ISO 字符串）。
class UserEntry {
  const UserEntry({
    required this.id,
    required this.name,
    required this.email,
    required this.birthday,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String? name;
  final String? email;

  /// YYYY-MM-DD；空为 null。
  final String? birthday;
  final String createdAt;
  final String updatedAt;

  factory UserEntry.fromJson(Map<String, dynamic> json) => UserEntry(
        id: json['id'] as String,
        name: json['name'] as String?,
        email: json['email'] as String?,
        birthday: json['birthday'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
        updatedAt: json['updatedAt'] as String? ?? '',
      );
}

/// 登录凭证（对齐 auth.types.ts 的 CredentialEntry）。
class CredentialEntry {
  const CredentialEntry({
    required this.id,
    required this.credentialId,
    required this.deviceLabel,
    required this.transports,
    required this.counter,
    required this.lastUsedAt,
    required this.createdAt,
  });

  final String id;
  final String credentialId;
  final String? deviceLabel;

  /// 认证器传输方式（usb/nfc/ble/internal/hybrid）。
  final List<String>? transports;
  final int counter;
  final String? lastUsedAt;
  final String createdAt;

  factory CredentialEntry.fromJson(Map<String, dynamic> json) =>
      CredentialEntry(
        id: json['id'] as String,
        credentialId: json['credentialId'] as String? ?? '',
        deviceLabel: json['deviceLabel'] as String?,
        transports:
            (json['transports'] as List<dynamic>?)?.cast<String>(),
        counter: (json['counter'] as num?)?.toInt() ?? 0,
        lastUsedAt: json['lastUsedAt'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// API 令牌（对齐 token.types.ts 的 TokenEntry；prefix 为随机段前 8 位）。
class TokenEntry {
  const TokenEntry({
    required this.id,
    required this.name,
    required this.prefix,
    required this.lastUsedAt,
    required this.revokedAt,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String prefix;
  final String? lastUsedAt;
  final String? revokedAt;
  final String createdAt;

  bool get isRevoked => revokedAt != null;

  factory TokenEntry.fromJson(Map<String, dynamic> json) => TokenEntry(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        prefix: json['prefix'] as String? ?? '',
        lastUsedAt: json['lastUsedAt'] as String?,
        revokedAt: json['revokedAt'] as String?,
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// 创建令牌响应：明文仅此一次。
class TokenCreateResult {
  const TokenCreateResult({required this.plaintext, required this.item});

  final String plaintext;
  final TokenEntry item;

  factory TokenCreateResult.fromJson(Map<String, dynamic> json) =>
      TokenCreateResult(
        plaintext: json['plaintext'] as String? ?? '',
        item: TokenEntry.fromJson(json['item'] as Map<String, dynamic>),
      );
}

/// /api/auth/me 载荷：{ authenticated, user }。
class AuthMeEntry {
  const AuthMeEntry({required this.authenticated, required this.user});

  final bool authenticated;
  final UserEntry? user;

  factory AuthMeEntry.fromJson(Map<String, dynamic> json) => AuthMeEntry(
        authenticated: json['authenticated'] as bool? ?? false,
        user: json['user'] == null
            ? null
            : UserEntry.fromJson(json['user'] as Map<String, dynamic>),
      );
}

/// ceremony 接口的返回形状：data = 解包后的响应 data，sessionCookie =
/// Set-Cookie 头里捕获的 serenique_session（原生客户端忽略 cookie 属性）。
typedef CeremonyResult = ({dynamic data, String? sessionCookie});

/// Auth/Users/Tokens 三块 HTTP 封装：只负责「请求 + 解包 + 模型转换」。
class AuthApi {
  AuthApi(this._client);

  final ApiClient _client;

  // ---- 登录 ceremony -------------------------------------------------------

  Future<({String challengeId, Map<String, dynamic> options})>
      loginStart() async {
    final data =
        await _client.postData('/api/auth/login/start') as Map<String, dynamic>;
    return (
      challengeId: data['challengeId'] as String,
      options: data['options'] as Map<String, dynamic>,
    );
  }

  Future<CeremonyResult> loginFinish({
    required String challengeId,
    required Map<String, dynamic> credential,
  }) async {
    final res = await _client.postRaw('/api/auth/login/finish', body: {
      'challengeId': challengeId,
      'credential': credential,
    });
    return (data: unwrapResponse(res.data), sessionCookie: sessionCookieFrom(res));
  }

  // ---- 注册 ceremony（登录态添加设备；引导期由 Web /setup 负责）--------------

  /// [body] 为空对象：门禁探测与添加设备都是无参调用。
  Future<({String challengeId, Map<String, dynamic> options})>
      registerStart([Map<String, dynamic> body = const {}]) async {
    final data = await _client.postData(
      '/api/auth/register/start',
      body: body,
    ) as Map<String, dynamic>;
    return (
      challengeId: data['challengeId'] as String,
      options: data['options'] as Map<String, dynamic>,
    );
  }

  Future<CeremonyResult> registerFinish({
    required String challengeId,
    String? deviceLabel,
    required Map<String, dynamic> credential,
  }) async {
    final res = await _client.postRaw('/api/auth/register/finish', body: {
      'challengeId': challengeId,
      if (deviceLabel != null && deviceLabel.isNotEmpty)
        'deviceLabel': deviceLabel,
      'credential': credential,
    });
    return (data: unwrapResponse(res.data), sessionCookie: sessionCookieFrom(res));
  }

  // ---- 会话 ----------------------------------------------------------------

  Future<AuthMeEntry> me() async {
    final data = await _client.getData('/api/auth/me');
    return AuthMeEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _client.postData('/api/auth/logout');
  }

  // ---- 凭证管理（需登录会话）------------------------------------------------

  Future<List<CredentialEntry>> listCredentials() async {
    final data = await _client.getData('/api/auth/credentials');
    return unwrapItems(data)
        .map((e) => CredentialEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 成功为 204 No Content（空 body）——不能走 unwrap 的 response.json()。
  Future<void> deleteCredential(String id) async {
    final res = await _client.deleteRaw('/api/auth/credentials/$id');
    if (res.statusCode == 204) return;
    unwrapResponse(res.data);
  }

  Future<CredentialEntry> renameCredential(
    String id,
    String? deviceLabel,
  ) async {
    final data = await _client.patchData(
      '/api/auth/credentials/$id',
      body: {'deviceLabel': deviceLabel},
    );
    return CredentialEntry.fromJson(data as Map<String, dynamic>);
  }

  // ---- 个人信息（需登录会话）------------------------------------------------

  Future<UserEntry> getProfile() async {
    final data = await _client.getData('/api/users/me');
    return UserEntry.fromJson(data as Map<String, dynamic>);
  }

  /// 部分更新：缺省字段保持不变；传 '' 即清除（对齐服务端 "" → null 归一化）。
  Future<UserEntry> updateProfile({
    String? name,
    String? email,
    String? birthday,
  }) async {
    final data = await _client.putData('/api/users/me', body: {
      'name': name,
      'email': email,
      'birthday': birthday,
    });
    return UserEntry.fromJson(data as Map<String, dynamic>);
  }

  // ---- API 令牌（需登录会话，GitHub PAT 模式）-------------------------------

  Future<List<TokenEntry>> listTokens() async {
    final data = await _client.getData('/api/tokens');
    return unwrapItems(data)
        .map((e) => TokenEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TokenCreateResult> createToken(String name) async {
    final data = await _client.postData('/api/tokens', body: {'name': name});
    return TokenCreateResult.fromJson(data as Map<String, dynamic>);
  }

  /// 成功为 204 No Content。
  Future<void> revokeToken(String id) async {
    final res = await _client.deleteRaw('/api/tokens/$id');
    if (res.statusCode == 204) return;
    unwrapResponse(res.data);
  }
}

final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(ref.watch(apiClientProvider));
});
