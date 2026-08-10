import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_protocol.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// 测试假 WS 通道：记录收到的 header/发送内容，可手动注入入站事件。
class FakeWsChannel implements WebSocketChannel {
  final _incoming = StreamController<Object?>.broadcast();
  final List<Object?> sent = [];

  @override
  Stream get stream => _incoming.stream;

  @override
  WebSocketSink get sink => _FakeSink(this);

  @override
  Future<void> get ready => Future.value();

  @override
  int? get closeCode => null;

  @override
  String? get closeReason => null;

  @override
  String? get protocol => null;

  // WebSocketChannel 在 web_socket_channel 3.x 中同时实现 StreamChannelMixin，
  // 其余成员（pipe/transform/cast 等）测试中不会用到，运行时调用即报错。
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnsupportedError(
      'FakeWsChannel.${invocation.memberName} not used in tests');

  void emit(String json) => _incoming.add(json);

  void closeIncoming() => _incoming.close();
}

class _FakeSink implements WebSocketSink {
  _FakeSink(this._ch);
  final FakeWsChannel _ch;

  @override
  void add(Object? data) => _ch.sent.add(data);

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}

  @override
  Future<void> addStream(Stream stream) async {
    await for (final e in stream) {
      add(e);
    }
  }

  @override
  Future<void> close([int? closeCode, String? closeReason]) async {}

  @override
  Future<void> get done => Future.value();
}

void main() {
  late Uri capturedUri;
  late Map<String, String> capturedHeaders;
  late FakeWsChannel channel;
  late AiClient client;

  AiClient buildClient({String? token}) {
    channel = FakeWsChannel();
    client = AiClient(
      baseUrl: 'https://api.example.com',
      tokenReader: () => token,
      channelFactory: (uri, headers) {
        capturedUri = uri;
        capturedHeaders = headers;
        return channel;
      },
    );
    return client;
  }

  test('wsUrl：http(s) → ws(s)，路径固定 /api/ai/ws', () {
    expect(buildClient().wsUrl, 'wss://api.example.com/api/ai/ws');
    final local = AiClient(baseUrl: 'http://192.168.1.5:3000', tokenReader: () => null);
    expect(local.wsUrl, 'ws://192.168.1.5:3000/api/ai/ws');
    final trailing = AiClient(baseUrl: 'https://api.example.com/', tokenReader: () => null);
    expect(trailing.wsUrl, 'wss://api.example.com/api/ai/ws');
  });

  test('握手注入 Bearer header；无 token 不带 Authorization', () async {
    await buildClient(token: 'abc').connect();
    expect(capturedUri.toString(), 'wss://api.example.com/api/ai/ws');
    expect(capturedHeaders['Authorization'], 'Bearer abc');
    expect(client.status, AiConnStatus.online);

    await buildClient().connect();
    expect(capturedHeaders.containsKey('Authorization'), isFalse);
  });

  test('入站 JSON 解析为 ServerMessage；坏数据忽略', () async {
    await buildClient().connect();
    final got = <ServerMessage>[];
    client.messages.listen(got.add);

    channel.emit('not-json');
    channel.emit('{"type":"agent_start"}');
    channel.emit('{"type":"sessions","sessions":[]}');

    await Future<void>.delayed(Duration.zero);
    expect(got, hasLength(2));
    expect(got.first, isA<AgentStartMessage>());
    expect(got.last, isA<SessionsMessage>());
  });

  test('send 序列化后写入通道', () async {
    await buildClient().connect();
    client.send(const ClientPrompt('你好'));
    expect(jsonDecode(channel.sent.single as String),
        {'type': 'prompt', 'text': '你好'});
  });

  test('通道关闭 → offline；未连接 send 静默丢弃', () async {
    await buildClient().connect();
    expect(client.status, AiConnStatus.online);

    channel.closeIncoming();
    await Future<void>.delayed(Duration.zero);
    expect(client.status, AiConnStatus.offline);

    client.send(const ClientAbort());
    expect(channel.sent, isEmpty);
  });

  test('connect 幂等：已连接不重建通道', () async {
    await buildClient().connect();
    await client.connect();
    expect(client.status, AiConnStatus.online);
  });

  group('handshakeErrorText：401 → 登录提示，其余 → 网络重试提示', () {
    test('dart:io WebSocketException（HTTP status code: 401）', () {
      // 本 SDK 的 dart:io 为 'HTTP status code: 401'（大写）；旧版为小写，见下例。
      final err = WebSocketException(
        'Connection to "wss://api.example.com/api/ai/ws" was not upgraded '
        'to websocket',
        401,
      );
      expect(handshakeErrorText(err), '登录已失效，请重新登录');
    });

    test('旧版小写形式 http status code: 401', () {
      expect(
        handshakeErrorText(
          WebSocketException(
            'Connection to "wss://api.example.com/api/ai/ws" was not '
            'upgraded to websocket, http status code: 401',
          ),
        ),
        '登录已失效，请重新登录',
      );
    });

    test('WebSocketChannelException.from 包装形式（message 内嵌原始 toString）', () {
      final wrapped = WebSocketChannelException.from(WebSocketException(
        'Connection to "wss://api.example.com/api/ai/ws" was not upgraded '
        'to websocket',
        401,
      ));
      expect(wrapped.toString(), contains('WebSocketChannelException:'));
      expect(handshakeErrorText(wrapped), '登录已失效，请重新登录');
    });

    test('普通网络错误（SocketException）→ 重试提示', () {
      expect(
        handshakeErrorText(SocketException('Connection refused')),
        '无法连接服务器，请检查网络后重试',
      );
    });
  });

  test('握手 401：connect 失败 → offline + lastError 登录提示', () async {
    client = AiClient(
      baseUrl: 'https://api.example.com',
      tokenReader: () => 'expired-token',
      channelFactory: (uri, headers) => throw WebSocketChannelException.from(
        WebSocketException(
          'Connection to "wss://api.example.com/api/ai/ws" was not upgraded '
          'to websocket',
          401,
        ),
      ),
    );
    await client.connect();
    expect(client.status, AiConnStatus.offline);
    expect(client.lastError, '登录已失效，请重新登录');
  });
}
