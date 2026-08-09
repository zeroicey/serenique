import 'dart:convert';

import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import 'auth_api.dart';

// ---------------------------------------------------------------------------
// WebAuthn ceremony 客户端（镜像 Web 端 features/auth/webauthn.ts）：
// API start 段 → 系统通行密钥弹窗 → API finish 段。
// 插件（corbado passkeys）异常与服务端 ApiException 统一翻译为中文文案。
// ---------------------------------------------------------------------------

/// 通行密钥 ceremony 抽象：生产实现包 corbado 插件，测试注入假实现。
abstract class PasskeyCeremony {
  /// 注册（create）。optionsJson = 服务端 start.options 的 JSON 串。
  /// 返回可直接 POST register/finish 的 credential JSON map。
  Future<Map<String, dynamic>> register(String optionsJson);

  /// 登录（get）。返回可直接 POST login/finish 的 credential JSON map。
  Future<Map<String, dynamic>> authenticate(String optionsJson);
}

/// 生产实现：corbado `passkeys` 插件。
class PluginPasskeyCeremony implements PasskeyCeremony {
  PluginPasskeyCeremony({PasskeyAuthenticator? authenticator})
      : _authenticator = authenticator ?? PasskeyAuthenticator();

  final PasskeyAuthenticator _authenticator;

  @override
  Future<Map<String, dynamic>> register(String optionsJson) async {
    final request = RegisterRequestType.fromJsonString(optionsJson);
    final response = await _authenticator.register(request);
    final credential = response.toJson();
    // 插件把 transports 放在 response.transports；服务端 schema 期望顶层
    // transports（决策⑩：不映射会被 Zod 剥离，丢失 transports 元数据）。
    final inner = credential['response'];
    if (inner is Map<String, dynamic>) {
      final transports = inner.remove('transports');
      if (transports is List && transports.isNotEmpty) {
        credential['transports'] = transports;
      }
    }
    return credential;
  }

  @override
  Future<Map<String, dynamic>> authenticate(String optionsJson) async {
    final request = AuthenticateRequestType.fromJsonString(
      optionsJson,
      mediation: MediationType.Optional,
      preferImmediatelyAvailableCredentials: false,
    );
    final response = await _authenticator.authenticate(request);
    return response.toJson();
  }
}

final passkeyCeremonyProvider =
    Provider<PasskeyCeremony>((ref) => PluginPasskeyCeremony());

/// 把 ceremony 异常翻译成中文提示。
///
/// - [ApiException]：服务端业务错误原样透传 message；网络层错误（statusCode
///   为空，dio 连接失败/超时映射而来）给「服务暂时不可用，请稍后再试」。
/// - 插件异常按 Web 端 `webauthn.ts` 的错误语义翻译（corbado 插件抛的是插件
///   自己的 `AuthenticatorException` 子类型，这里按类型适配）。
String translateWebauthnError(Object error, {required bool isLogin}) {
  if (error is ApiException) {
    if (error.statusCode == null) return '服务暂时不可用，请稍后再试';
    return error.message;
  }
  return switch (error) {
    // 用户取消 / 没有匹配的凭证（NotAllowedError 语义）。
    PasskeyAuthCancelledException() || NoCredentialsAvailableException() =>
      isLogin ? '已取消或没有可用的通行密钥' : '已取消注册',
    // 设备/系统不支持（NotSupportedError 语义）。
    DeviceNotSupportedException() || PasskeyUnsupportedException() =>
      '当前环境不支持通行密钥（WebAuthn）',
    // 域名关联失败 / 来源不受信任（SecurityError 语义，需 HTTPS 或 localhost）。
    DomainNotAssociatedException() =>
      '当前来源不受信任，无法使用通行密钥（需 HTTPS 或 localhost）',
    // 排除列表命中，本机已存在该凭证（InvalidStateError 语义）。
    ExcludeCredentialsCanNotBeRegisteredException() =>
      '此设备已经注册过通行密钥',
    // 操作超时（AbortError 语义）。
    TimeoutException() => '操作已中止',
    _ => isLogin ? '通行密钥验证失败，请重试' : '通行密钥注册失败，请重试',
  };
}

/// 登录 ceremony：login/start → 系统通行密钥弹窗 → login/finish。
/// 返回服务端 data 与会话 cookie（登录成功服务端必发 Set-Cookie）。
Future<CeremonyResult> loginWithPasskeyCeremony({
  required AuthApi api,
  required PasskeyCeremony ceremony,
}) async {
  final start = await api.loginStart();
  final credential = await ceremony.authenticate(jsonEncode(start.options));
  return api.loginFinish(
    challengeId: start.challengeId,
    credential: credential,
  );
}

/// 注册 ceremony（登录态添加设备）：register/start → 系统弹窗 → register/finish。
/// 成功即刷新会话（服务端 registerFinish 也发 Set-Cookie）。
Future<CeremonyResult> registerDeviceCeremony({
  required AuthApi api,
  required PasskeyCeremony ceremony,
  String? deviceLabel,
}) async {
  final start = await api.registerStart(const {});
  final credential = await ceremony.register(jsonEncode(start.options));
  return api.registerFinish(
    challengeId: start.challengeId,
    deviceLabel: deviceLabel,
    credential: credential,
  );
}
