import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_protocol.dart';

void main() {
  group('ServerMessage.fromJson', () {
    test('sessions 列表解析', () {
      final msg = ServerMessage.fromJson(
        jsonDecode('''
        {"type":"sessions","sessions":[
          {"id":"s1","name":"今日计划","messageCount":3,"modified":"2026-08-10T10:00:00Z"}
        ]}
      '''),
      );
      expect(msg, isA<SessionsMessage>());
      final m = msg! as SessionsMessage;
      expect(m.sessions.single.id, 's1');
      expect(m.sessions.single.messageCount, 3);
    });

    test('session_ready 保留原始 messages 列表', () {
      final msg = ServerMessage.fromJson(
        jsonDecode(
          '{"type":"session_ready","sessionId":"s1","model":"opencode-go/deepseek-v4-flash","messages":[{"role":"user","text":"hi","thinking":"","toolCalls":[]}],"totalMessageCount":1,"hasMore":false}',
        ),
      );
      final m = msg! as SessionReadyMessage;
      expect(m.sessionId, 's1');
      expect(m.model, 'opencode-go/deepseek-v4-flash');
      expect(m.messages.length, 1);
      expect(m.totalMessageCount, 1);
      expect(m.hasMore, isFalse);
    });

    test('message_update 区分 textDelta / thinking_delta', () {
      final text =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"你好"}}',
                ),
              )!
              as MessageUpdateMessage;
      expect(text.isTextDelta, isTrue);
      expect(text.delta, '你好');

      final think =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"让我想想"}}',
                ),
              )!
              as MessageUpdateMessage;
      expect(think.isTextDelta, isFalse);
      expect(think.delta, '让我想想');
    });

    test('工具事件解析', () {
      final start =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"tool_execution_start","toolCallId":"t1","toolName":"list_tasks","args":{"groupId":"g1"}}',
                ),
              )!
              as ToolExecutionStartMessage;
      expect(start.toolCallId, 't1');
      expect((start.args as Map)['groupId'], 'g1');

      final end =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"tool_execution_end","toolCallId":"t1","toolName":"list_tasks","result":"[]","isError":true}',
                ),
              )!
              as ToolExecutionEndMessage;
      expect(end.isError, isTrue);
      expect(end.result, '[]');
    });

    test('未知 type / 坏结构返回 null', () {
      expect(ServerMessage.fromJson(jsonDecode('{"type":"nope"}')), isNull);
      expect(
        ServerMessage.fromJson(
          jsonDecode(
            '{"type":"message_update","assistantMessageEvent":{"type":"x","delta":"y"}}',
          ),
        ),
        isNull,
      );
      expect(ServerMessage.fromJson('not json'), isNull);
      expect(ServerMessage.fromJson(null), isNull);
    });

    test('messages_loaded 解析', () {
      final msg =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"messages_loaded","messages":[{"role":"assistant","text":"更早","thinking":"","toolCalls":[]}],"totalMessageCount":3,"hasMore":true}',
                ),
              )!
              as MessagesLoadedMessage;
      expect(msg.messages.length, 1);
      expect(msg.totalMessageCount, 3);
      expect(msg.hasMore, isTrue);
    });

    test('session_switched 链延续字段解析（chainContinuation/reason/marker）', () {
      final msg =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"session_switched","sessionId":"s2","model":"m","messages":[],"totalMessageCount":0,"hasMore":false,"chainContinuation":true,"reason":"manual","marker":"已开启新会话"}',
                ),
              )!
              as SessionSwitchedMessage;
      expect(msg.sessionId, 's2');
      expect(msg.chainContinuation, isTrue);
      expect(msg.reason, 'manual');
      expect(msg.marker, '已开启新会话');
      expect(msg.messages, isEmpty);
    });

    test('session_compacted 分页重同步解析（含 anchor + summary）', () {
      final msg =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"session_compacted","sessionId":"s1","messages":[{"role":"compactionSummary","kind":"compaction","text":"已压缩","detail":"早期对话摘要","thinking":"","toolCalls":[]}],"totalMessageCount":30,"hasMore":true,"anchor":10,"summary":"早期对话摘要"}',
                ),
              )!
              as SessionCompactedMessage;
      expect(msg.sessionId, 's1');
      expect(msg.messages.length, 1);
      expect(msg.totalMessageCount, 30);
      expect(msg.hasMore, isTrue);
      expect(msg.anchor, 10);
      expect(msg.summary, '早期对话摘要'); // 评审 B2：压缩摘要文本
    });

    test('compaction_start / compaction_end 解析', () {
      final start =
          ServerMessage.fromJson(
                jsonDecode('{"type":"compaction_start","reason":"overflow"}'),
              )!
              as CompactionStartMessage;
      expect(start.reason, 'overflow');

      final end =
          ServerMessage.fromJson(
                jsonDecode(
                  '{"type":"compaction_end","reason":"manual","result":{"summary":"摘要","tokensBefore":5000,"firstKeptEntryId":"e1"},"aborted":false,"willRetry":false}',
                ),
              )!
              as CompactionEndMessage;
      expect(end.reason, 'manual');
      expect(end.result!.summary, '摘要');
      expect(end.result!.tokensBefore, 5000);
      expect(end.result!.firstKeptEntryId, 'e1');
      expect(end.aborted, isFalse);
      expect(end.willRetry, isFalse);
    });
  });

  group('ClientMessage.toJson', () {
    test('type 与字段名对齐后端协议', () {
      expect(
        jsonEncode(const ClientPrompt('hi')),
        '{"type":"prompt","text":"hi"}',
      );
      expect(
        jsonEncode(const ClientSwitchSession('s1')),
        '{"type":"switch_session","sessionId":"s1"}',
      );
      expect(jsonEncode(const ClientAbort()), '{"type":"abort"}');
      expect(
        jsonEncode(const ClientDeleteSession('s1')),
        '{"type":"delete_session","sessionId":"s1"}',
      );
    });

    test('ClientLoadMore 序列化', () {
      expect(jsonEncode(const ClientLoadMore()), '{"type":"load_more"}');
      expect(
        jsonEncode(const ClientLoadMore(limit: 30)),
        '{"type":"load_more","limit":30}',
      );
    });

    test('ClientCompact 序列化', () {
      expect(jsonEncode(const ClientCompact()), '{"type":"compact"}');
    });
  });
}
