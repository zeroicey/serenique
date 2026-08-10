import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/event/event_api.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

/// 固定返回 body，供「解包正确性」用例。
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.body);
  final String body;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    body,
    200,
    headers: {Headers.contentTypeHeader: ['application/json']},
  );

  @override
  void close({bool force = false}) {}
}

/// 记录最近一次请求的 query 与 body。
class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.onRequest);
  final String Function(RequestOptions options) onRequest;

  Map<String, dynamic>? lastQuery;
  String? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastQuery = options.queryParameters;
    final data = options.data;
    if (data is Map<String, dynamic>) lastBody = jsonEncode(data);
    return ResponseBody.fromString(
      onRequest(options),
      200,
      headers: {Headers.contentTypeHeader: ['application/json']},
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(String baseUrl, String body) => ApiClient(
  baseUrl: baseUrl,
  tokenReader: () => null,
  dio: Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = _FakeAdapter(body),
);

const _entryJson = {
  'id': 'e1',
  'title': '晨会',
  'startAt': '2026-08-05T09:00:00+08:00',
  'endAt': '2026-08-05T10:00:00+08:00',
  'isAllDay': false,
  'location': '会议室',
  'note': '带笔',
  'createdAt': 't1',
  'updatedAt': 't2',
};

void main() {
  test('listRange：裸数组解码 + query 带 from/to', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({
        'success': true,
        'message': 'ok',
        'data': [_entryJson],
      }),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter,
    );
    final items = await EventApi(client).listRange(from: 'a', to: 'b');
    expect(items, hasLength(1));
    expect(items.single.title, '晨会');
    expect(adapter.lastQuery!['from'], 'a');
    expect(adapter.lastQuery!['to'], 'b');
  });

  test('countToday：按本地日窗数裸数组', () async {
    final client = _client(
      'https://api.test',
      jsonEncode({'success': true, 'message': 'ok', 'data': [_entryJson, _entryJson]}),
    );
    expect(await EventApi(client).countToday(), 2);
  });

  test('create：payload 带偏移 ISO + 全天标记 + location/note 空串', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({'success': true, 'message': 'ok', 'data': _entryJson}),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter,
    );
    final e = await EventApi(client).create(
      title: '晨会',
      startAt: DateTime(2026, 8, 5, 9),
      endAt: DateTime(2026, 8, 5, 10),
      isAllDay: false,
    );
    expect(e.id, 'e1');
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['title'], '晨会');
    expect(body['startAt'], withOffset(DateTime(2026, 8, 5, 9)));
    expect(body['isAllDay'], isFalse);
    expect(body['location'], '');
    expect(body['note'], '');
  });

  test('update：PUT 到 /api/events/:id 且全字段提交', () async {
    final adapter = _RecordingAdapter(
      (options) => jsonEncode({'success': true, 'message': 'ok', 'data': _entryJson}),
    );
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter,
    );
    await EventApi(client).update('e1',
        title: '新标题', startAt: DateTime(2026, 8, 5, 9), endAt: DateTime(2026, 8, 5, 10),
        isAllDay: true, location: '', note: '备注');
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['title'], '新标题');
    expect(body['isAllDay'], isTrue);
    expect(body['note'], '备注');
  });
}
