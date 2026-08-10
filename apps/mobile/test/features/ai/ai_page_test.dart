import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_page.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

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
  ProviderContainer makeContainer(List<FakeWsChannel> channels) {
    return ProviderContainer(overrides: [
      aiClientFactoryProvider.overrideWithValue(() {
        final ch = FakeWsChannel();
        channels.add(ch);
        return AiClient(
          baseUrl: 'https://api.example.com',
          tokenReader: () => null,
          channelFactory: (uri, headers) => ch,
        );
      }),
    ]);
  }

  Widget host(ProviderContainer container) => UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: Scaffold(body: AiPage())),
      );

  testWidgets('挂载自动连接；收到历史消息后渲染', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();
    expect(channels, hasLength(1));
    expect(container.read(aiControllerProvider).status, AiConnStatus.online);

    channels.single.emit(jsonEncode({
      'type': 'session_ready',
      'sessionId': 's1',
      'model': 'm',
      'messages': [
        {'role': 'user', 'text': '早上好', 'thinking': '', 'toolCalls': []},
      ],
    }));
    await tester.pump();
    expect(find.text('早上好'), findsOneWidget);
  });

  testWidgets('断线显示横幅；点重试建立新连接', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();
    expect(find.text('连接已断开'), findsNothing);

    channels.single.closeIncoming();
    await tester.pump();
    await tester.pump();
    expect(find.text('连接已断开'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();
    expect(channels, hasLength(2));
    expect(find.text('连接已断开'), findsNothing);
  });

  testWidgets('error 事件弹 SnackBar', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    channels.single.emit(jsonEncode({'type': 'error', 'message': '模型超时'}));
    await tester.pump();
    expect(find.text('模型超时'), findsOneWidget);
  });
}
