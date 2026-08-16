import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/habit/habit_api.dart';

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
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// 记录最近一次请求的 query 与 body，并返回固定响应。
class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.responseBody);
  final String responseBody;

  Map<String, dynamic>? lastQuery;
  String? lastBody;
  String? lastPath;
  String? lastMethod;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastMethod = options.method;
    lastPath = options.path;
    lastQuery = options.queryParameters;
    final data = options.data;
    if (data is Map<String, dynamic>) lastBody = jsonEncode(data);
    return ResponseBody.fromString(
      responseBody,
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(String body) => ApiClient(
  baseUrl: 'http://x',
  tokenReader: () => null,
  dio: Dio(BaseOptions(baseUrl: 'http://x'))
    ..httpClientAdapter = _FakeAdapter(body),
);

const _habitJson = {
  'id': 'h1',
  'name': '跑步',
  'description': '每天晨跑 5 公里',
  'kind': 'good',
  'countable': false,
  'sortOrder': 0,
  'createdAt': 't1',
  'updatedAt': 't2',
};

const _dailyJson = {'habitId': 'h1', 'status': 'done', 'count': 0};

String _wrap(Object data) =>
    jsonEncode({'success': true, 'message': 'ok', 'data': data});

void main() {
  test('list：裸数组解码', () async {
    final api = HabitApi(_client(_wrap([_habitJson])));
    final habits = await api.list();
    expect(habits.length, 1);
    expect(habits[0].name, '跑步');
  });

  test('create：POST body 带 name/kind/countable，description 可选', () async {
    final adapter = _RecordingAdapter(_wrap(_habitJson));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    final h = await api.create(
      name: '跑步',
      kind: 'good',
      countable: true,
      description: '每天晨跑 5 公里',
    );
    expect(h.name, '跑步');
    expect(h.description, '每天晨跑 5 公里');
    expect(adapter.lastMethod, 'POST');
    expect(adapter.lastPath, '/api/habits');
    expect(jsonDecode(adapter.lastBody!), {
      'name': '跑步',
      'kind': 'good',
      'countable': true,
      'description': '每天晨跑 5 公里',
    });
  });

  test('create：description 缺省不携带该字段', () async {
    final adapter = _RecordingAdapter(_wrap(_habitJson));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    await api.create(name: '跑步', kind: 'good');
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body.containsKey('description'), isFalse);
  });

  test('update：只传非空字段（含 description）', () async {
    final adapter = _RecordingAdapter(_wrap(_habitJson));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    await api.update('h1', name: '晨跑', sortOrder: 2);
    expect(adapter.lastPath, '/api/habits/h1');
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body, {'name': '晨跑', 'sortOrder': 2});

    await api.update('h1', description: '新简介');
    expect(jsonDecode(adapter.lastBody!), {'description': '新简介'});
  });

  test('delete：DELETE 路径正确', () async {
    final adapter = _RecordingAdapter(_wrap({}));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    await api.delete('h1');
    expect(adapter.lastMethod, 'DELETE');
    expect(adapter.lastPath, '/api/habits/h1');
  });

  test('listDaily：query 带 date，解码裸数组', () async {
    final adapter = _RecordingAdapter(_wrap([_dailyJson]));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    final daily = await api.listDaily('2026-08-16');
    expect(adapter.lastPath, '/api/habit-daily');
    expect(adapter.lastQuery, {'date': '2026-08-16'});
    expect(daily.length, 1);
    expect(daily[0].isDone, isTrue);
  });

  test('setDaily：做没做型传 status，计数型传 count', () async {
    final adapter = _RecordingAdapter(_wrap({}));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    await api.setDaily(habitId: 'h1', date: '2026-08-16', status: 'done');
    expect(adapter.lastPath, '/api/habits/h1/daily/2026-08-16');
    expect(adapter.lastMethod, 'PUT');
    expect(jsonDecode(adapter.lastBody!), {'status': 'done'});

    await api.setDaily(habitId: 'h2', date: '2026-08-16', count: 3);
    expect(jsonDecode(adapter.lastBody!), {'count': 3});
  });

  test('clearDaily：DELETE 每日状态', () async {
    final adapter = _RecordingAdapter(_wrap({}));
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    await api.clearDaily(habitId: 'h1', date: '2026-08-16');
    expect(adapter.lastMethod, 'DELETE');
    expect(adapter.lastPath, '/api/habits/h1/daily/2026-08-16');
  });

  test('overview：query 带 days，解码 byDate + stats', () async {
    final adapter = _RecordingAdapter(
      _wrap({
        'days': 30,
        'fromDate': '2026-07-18',
        'toDate': '2026-08-16',
        'byDate': {'2026-08-16': []},
        'stats': [
          {
            'habitId': 'h1',
            'name': '跑步',
            'kind': 'good',
            'countable': false,
            'doneDays': 3,
            'notDoneDays': 1,
            'totalCount': 0,
          },
        ],
      }),
    );
    final api = HabitApi(
      ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter,
      ),
    );
    final ov = await api.overview(30);
    expect(adapter.lastPath, '/api/habit-daily/overview');
    expect(adapter.lastQuery, {'days': 30});
    expect(ov.stats[0].doneDays, 3);
  });
}
