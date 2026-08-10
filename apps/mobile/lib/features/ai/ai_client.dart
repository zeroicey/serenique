// 宁序 WS 客户端：URL 派生、Bearer 认证握手、收发、连接状态。
// 状态语义：connecting（握手进行中）/ online（可收发）/ offline（断开或失败）。
// 通道工厂可注入（测试用假通道），生产默认 IOWebSocketChannel。
import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'ai_protocol.dart';

enum AiConnStatus { connecting, online, offline }

/// 握手失败文案：HTTP 401（token 失效/未授权）→ 登录提示；其余 → 网络重试提示。
/// dart:io 的 WebSocketException 各 SDK 版本的 message 大小写形式不同
/// （`http status code: 401` / `HTTP status code: 401`），故匹配公共子串
/// `status code: 401`；WebSocketChannelException.from 包装形式（message 内嵌
/// 原始异常 toString）同样命中。
String handshakeErrorText(Object error) {
  final msg = error.toString();
  if (msg.contains('http status code: 401') ||
      msg.contains('status code: 401')) {
    return '登录已失效，请重新登录';
  }
  return '无法连接服务器，请检查网络后重试';
}

typedef WsChannelFactory =
    WebSocketChannel Function(Uri uri, Map<String, String> headers);

class AiClient {
  AiClient({
    required this.baseUrl,
    required this.tokenReader,
    WsChannelFactory? channelFactory,
  }) : _factory =
            channelFactory ??
            ((uri, headers) => IOWebSocketChannel.connect(uri, headers: headers));

  final String baseUrl;
  final String? Function() tokenReader;
  final WsChannelFactory _factory;

  final StreamController<ServerMessage> _messages =
      StreamController<ServerMessage>.broadcast();
  final StreamController<AiConnStatus> _status =
      StreamController<AiConnStatus>.broadcast();

  WebSocketChannel? _channel;
  StreamSubscription<Object?>? _sub;
  AiConnStatus _statusValue = AiConnStatus.offline;
  String? _lastError;

  Stream<ServerMessage> get messages => _messages.stream;
  Stream<AiConnStatus> get statusStream => _status.stream;
  AiConnStatus get status => _statusValue;
  String? get lastError => _lastError;

  /// 派生 ws:// URL：http(s)→ws(s)，路径 /api/ai/ws（镜像 Web ws-url.ts）。
  String get wsUrl {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return '${base.replaceFirst(RegExp('^http'), 'ws')}/api/ai/ws';
  }

  /// 幂等连接：已有通道（connecting/online）不重建。
  Future<void> connect() async {
    if (_channel != null) return;
    final token = tokenReader();
    final headers = <String, String>{
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
    _setStatus(AiConnStatus.connecting);
    try {
      final channel = _factory(Uri.parse(wsUrl), headers);
      _channel = channel;
      await channel.ready; // 握手：失败/401 在此抛错
      _setStatus(AiConnStatus.online);
      _sub = channel.stream.listen(_onData, onDone: _onClosed, onError: _onError);
    } catch (e) {
      _channel = null;
      _lastError = handshakeErrorText(e);
      _setStatus(AiConnStatus.offline);
    }
  }

  void _onData(Object? data) {
    if (data is! String) return;
    final msg = ServerMessage.fromJson(_tryDecode(data));
    if (msg != null) _messages.add(msg);
  }

  Object? _tryDecode(String data) {
    try {
      return jsonDecode(data);
    } catch (_) {
      return null;
    }
  }

  void _onClosed() {
    _channel = null;
    _sub = null;
    _setStatus(AiConnStatus.offline);
  }

  void _onError(Object error, StackTrace st) {
    _channel = null;
    _sub = null;
    _lastError = '连接中断，请点击重试';
    _setStatus(AiConnStatus.offline);
  }

  void _setStatus(AiConnStatus s) {
    _statusValue = s;
    _status.add(s);
  }

  void send(ClientMessage msg) {
    final channel = _channel;
    if (channel == null) return;
    channel.sink.add(jsonEncode(msg.toJson()));
  }

  void close() {
    _sub?.cancel();
    _channel?.sink.close();
    _channel = null;
    _sub = null;
  }
}
