import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_api.dart';
import 'package:serenique_mobile/features/auth/webauthn.dart';
import '../../helpers.dart';

/// 把插件调用记录下来的假 authenticator（插件自身是具体类，可继承覆写）。
class _StubAuthenticator extends PasskeyAuthenticator {
  _StubAuthenticator({this.registerResponse, this.authenticateResponse});

  final RegisterResponseType? registerResponse;
  final AuthenticateResponseType? authenticateResponse;
  RegisterRequestType? lastRegisterRequest;
  AuthenticateRequestType? lastAuthenticateRequest;

  @override
  Future<RegisterResponseType> register(RegisterRequestType request) async {
    lastRegisterRequest = request;
    return registerResponse!;
  }

  @override
  Future<AuthenticateResponseType> authenticate(
    AuthenticateRequestType request,
  ) async {
    lastAuthenticateRequest = request;
    return authenticateResponse!;
  }
}

/// 记录调用参数的假 AuthApi（不发网络请求）。
class _StubAuthApi extends AuthApi {
  _StubAuthApi() : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  Map<String, dynamic> loginStartOptions = {'challenge': 'Y2g', 'rpId': 'localhost'};
  Map<String, dynamic> registerStartOptions = {
    'challenge': 'aGVsbG8',
    'rp': {'id': 'serenique.0icey.icu', 'name': 'Serenique'},
    'user': {'id': 'dXNlcg', 'name': 'user', 'displayName': 'User'},
    'excludeCredentials': <dynamic>[],
  };
  String sessionCookie = 'sess123';

  String? lastLoginChallengeId;
  Map<String, dynamic>? lastLoginCredential;
  String? lastRegisterChallengeId;
  String? lastRegisterDeviceLabel;
  Map<String, dynamic>? lastRegisterCredential;

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      loginStart() async {
    return (challengeId: 'login-c1', options: loginStartOptions);
  }

  @override
  Future<CeremonyResult> loginFinish({
    required String challengeId,
    required Map<String, dynamic> credential,
  }) async {
    lastLoginChallengeId = challengeId;
    lastLoginCredential = credential;
    return (data: {'authenticated': true}, sessionCookie: sessionCookie);
  }

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      registerStart([Map<String, dynamic> body = const {}]) async {
    return (challengeId: 'reg-c1', options: registerStartOptions);
  }

  @override
  Future<CeremonyResult> registerFinish({
    required String challengeId,
    String? deviceLabel,
    required Map<String, dynamic> credential,
  }) async {
    lastRegisterChallengeId = challengeId;
    lastRegisterDeviceLabel = deviceLabel;
    lastRegisterCredential = credential;
    return (data: {'authenticated': true}, sessionCookie: sessionCookie);
  }
}

void main() {
  group('translateWebauthnError', () {
    test('登录：取消/无凭证 → 已取消或没有可用的通行密钥', () {
      expect(
        translateWebauthnError(PasskeyAuthCancelledException(), isLogin: true),
        '已取消或没有可用的通行密钥',
      );
      expect(
        translateWebauthnError(NoCredentialsAvailableException(), isLogin: true),
        '已取消或没有可用的通行密钥',
      );
    });

    test('注册：取消 → 已取消注册', () {
      expect(
        translateWebauthnError(PasskeyAuthCancelledException(), isLogin: false),
        '已取消注册',
      );
    });

    test('环境不支持 → 当前环境不支持通行密钥', () {
      expect(
        translateWebauthnError(DeviceNotSupportedException(), isLogin: true),
        '当前环境不支持通行密钥（WebAuthn）',
      );
      expect(
        translateWebauthnError(PasskeyUnsupportedException(), isLogin: false),
        '当前环境不支持通行密钥（WebAuthn）',
      );
    });

    test('域名未关联 → 当前来源不受信任', () {
      expect(
        translateWebauthnError(
          DomainNotAssociatedException('domain-not-associated'),
          isLogin: true,
        ),
        '当前来源不受信任，无法使用通行密钥（需 HTTPS 或 localhost）',
      );
    });

    test('排除列表命中 → 此设备已经注册过通行密钥', () {
      expect(
        translateWebauthnError(
          ExcludeCredentialsCanNotBeRegisteredException(),
          isLogin: false,
        ),
        '此设备已经注册过通行密钥',
      );
    });

    test('超时 → 操作已中止', () {
      expect(
        translateWebauthnError(TimeoutException('timeout'), isLogin: true),
        '操作已中止',
      );
    });

    test('未知插件异常 → 按动作兜底文案', () {
      expect(
        translateWebauthnError(
          UnhandledAuthenticatorException('x', null, null),
          isLogin: true,
        ),
        '通行密钥验证失败，请重试',
      );
      expect(
        translateWebauthnError(
          UnhandledAuthenticatorException('x', null, null),
          isLogin: false,
        ),
        '通行密钥注册失败，请重试',
      );
      expect(
        translateWebauthnError(MalformedBase64UrlChallenge(), isLogin: true),
        '通行密钥验证失败，请重试',
      );
    });

    test('ApiException（服务端业务错误）原样透传 message', () {
      const api = ApiException('CONFLICT', '至少需要保留一把登录凭证', statusCode: 409);
      expect(translateWebauthnError(api, isLogin: true), api.message);
      expect(translateWebauthnError(api, isLogin: false), api.message);
    });

    test('网络层错误（无 statusCode）→ 服务暂时不可用', () {
      const network = ApiException('NETWORK', '网络连接失败，请检查网络');
      expect(
        translateWebauthnError(network, isLogin: true),
        '服务暂时不可用，请稍后再试',
      );
    });
  });

  group('PluginPasskeyCeremony', () {
    const registerOptions = {
      'challenge': 'aGVsbG8',
      'rp': {'id': 'serenique.0icey.icu', 'name': 'Serenique'},
      'user': {'id': 'dXNlcg', 'name': 'user', 'displayName': 'User'},
      'pubKeyCredParams': [
        {'type': 'public-key', 'alg': -7},
      ],
      'authenticatorSelection': {
        'residentKey': 'required',
        'userVerification': 'required',
        'requireResidentKey': true,
      },
      'attestation': 'none',
      'excludeCredentials': <dynamic>[],
      'timeout': 60000,
    };

    test('注册：options 原样透传给插件', () async {
      final stub = _StubAuthenticator(
        registerResponse: RegisterResponseType(
          id: 'cred-id',
          rawId: 'cred-id',
          clientDataJSON: 'cdj',
          attestationObject: 'ao',
          transports: const ['internal'],
        ),
      );
      final ceremony = PluginPasskeyCeremony(authenticator: stub);
      await ceremony.register(jsonEncode(registerOptions));
      expect(stub.lastRegisterRequest!.challenge, 'aGVsbG8');
      expect(stub.lastRegisterRequest!.relyingParty.id, 'serenique.0icey.icu');
      expect(stub.lastRegisterRequest!.user.id, 'dXNlcg');
      expect(stub.lastRegisterRequest!.authSelectionType?.residentKey, 'required');
    });

    test('注册：response.transports 挪到顶层（决策⑩），响应内移除', () async {
      final stub = _StubAuthenticator(
        registerResponse: RegisterResponseType(
          id: 'cred-id',
          rawId: 'cred-id',
          clientDataJSON: 'cdj',
          attestationObject: 'ao',
          transports: const ['internal', 'usb'],
        ),
      );
      final ceremony = PluginPasskeyCeremony(authenticator: stub);
      final credential = await ceremony.register(jsonEncode(registerOptions));
      expect(credential['transports'], ['internal', 'usb']);
      expect(
        (credential['response'] as Map<String, dynamic>)['transports'],
        isNull,
      );
      expect(credential['type'], 'public-key');
    });

    test('注册：无 transports 时不产生顶层 transports 键', () async {
      final stub = _StubAuthenticator(
        registerResponse: RegisterResponseType(
          id: 'cred-id',
          rawId: 'cred-id',
          clientDataJSON: 'cdj',
          attestationObject: 'ao',
          transports: const [],
        ),
      );
      final ceremony = PluginPasskeyCeremony(authenticator: stub);
      final credential = await ceremony.register(jsonEncode(registerOptions));
      expect(credential.containsKey('transports'), isFalse);
    });

    test('登录：options 透传，mediation=Optional、preferImmediatelyAvailable=false', () async {
      final stub = _StubAuthenticator(
        authenticateResponse: AuthenticateResponseType(
          id: 'cred-id',
          rawId: 'cred-id',
          clientDataJSON: 'cdj',
          authenticatorData: 'ad',
          signature: 'sig',
          userHandle: '',
        ),
      );
      final ceremony = PluginPasskeyCeremony(authenticator: stub);
      await ceremony.authenticate(jsonEncode({
        'challenge': 'Y2g',
        'rpId': 'serenique.0icey.icu',
        'userVerification': 'required',
        'timeout': 60000,
      }));
      expect(stub.lastAuthenticateRequest!.relyingPartyId, 'serenique.0icey.icu');
      expect(stub.lastAuthenticateRequest!.challenge, 'Y2g');
      expect(
        stub.lastAuthenticateRequest!.mediation,
        MediationType.Optional,
      );
      expect(
        stub.lastAuthenticateRequest!.preferImmediatelyAvailableCredentials,
        isFalse,
      );
    });
  });

  group('ceremony 编排', () {
    test('登录：login/start → authenticate → login/finish（challengeId + credential）', () async {
      final api = _StubAuthApi();
      final ceremony = FakePasskeyCeremony(
        authenticateResult: {
          'id': 'cred-id',
          'rawId': 'cred-id',
          'type': 'public-key',
          'response': {'clientDataJSON': 'cdj', 'authenticatorData': 'ad', 'signature': 'sig'},
        },
      );
      final result = await loginWithPasskeyCeremony(api: api, ceremony: ceremony);
      expect(api.lastLoginChallengeId, 'login-c1');
      expect(api.lastLoginCredential, ceremony.authenticateResult);
      expect(result.sessionCookie, 'sess123');
      // options JSON 原样透传给插件
      expect(jsonDecode(ceremony.lastAuthenticateOptions!), api.loginStartOptions);
    });

    test('注册：register/start → register → register/finish（deviceLabel 透传）', () async {
      final api = _StubAuthApi();
      final ceremony = FakePasskeyCeremony(
        registerResult: {
          'id': 'cred-id',
          'rawId': 'cred-id',
          'type': 'public-key',
          'response': {'clientDataJSON': 'cdj', 'attestationObject': 'ao'},
          'transports': ['internal'],
        },
      );
      final result = await registerDeviceCeremony(
        api: api,
        ceremony: ceremony,
        deviceLabel: 'iPhone · Apple',
      );
      expect(api.lastRegisterChallengeId, 'reg-c1');
      expect(api.lastRegisterDeviceLabel, 'iPhone · Apple');
      expect(api.lastRegisterCredential, ceremony.registerResult);
      expect(result.sessionCookie, 'sess123');
      expect(jsonDecode(ceremony.lastRegisterOptions!), api.registerStartOptions);
    });

    test('注册：deviceLabel 为空不传', () async {
      final api = _StubAuthApi();
      final ceremony = FakePasskeyCeremony(registerResult: {});
      await registerDeviceCeremony(api: api, ceremony: ceremony);
      expect(api.lastRegisterDeviceLabel, isNull);
    });
  });
}
