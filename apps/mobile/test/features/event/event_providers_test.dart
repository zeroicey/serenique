import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/event/event_api.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';

class _FakeAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    '{}', 200,
    headers: {Headers.contentTypeHeader: ['application/json']},
  );

  @override
  void close({bool force = false}) {}
}

ApiClient _dummyClient() => ApiClient(
  baseUrl: 'https://api.test',
  tokenReader: () => null,
  dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = _FakeAdapter(),
);

/// 记录调用次数的事件 API stub（EventApi 方法默认虚，可覆写）。
class _StubEventApi extends EventApi {
  _StubEventApi() : super(_dummyClient());

  int listByDayCalls = 0;
  int countCalls = 0;
  int creates = 0;
  bool deleted = false;

  @override
  Future<List<EventEntry>> listByDay(String day) async {
    listByDayCalls++;
    return [];
  }

  @override
  Future<int> countToday() async {
    countCalls++;
    return 3;
  }

  @override
  Future<EventEntry> create({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    creates++;
    return EventEntry(
      id: 'e1', title: title, startAt: 't', endAt: 't', isAllDay: isAllDay,
      createdAt: 't', updatedAt: 't',
    );
  }

  @override
  Future<void> delete(String id) async {
    deleted = true;
  }
}

void main() {
  test('eventsForDayProvider 委托 listByDay 并缓存', () async {
    final stub = _StubEventApi();
    final container = ProviderContainer(overrides: [eventApiProvider.overrideWithValue(stub)]);
    addTearDown(container.dispose);

    await container.read(eventsForDayProvider('2026-08-05').future);
    expect(stub.listByDayCalls, 1);

    await container.read(eventsForDayProvider('2026-08-05').future);
    expect(stub.listByDayCalls, 1); // 命中缓存
  });

  test('actions.create 后整体失效：同 day 重新拉取', () async {
    final stub = _StubEventApi();
    final container = ProviderContainer(overrides: [eventApiProvider.overrideWithValue(stub)]);
    addTearDown(container.dispose);

    await container.read(eventsForDayProvider('2026-08-05').future);
    expect(stub.listByDayCalls, 1);

    await container.read(eventActionsProvider).create(
      title: 'x', startAt: DateTime(2026, 8, 5, 9), endAt: DateTime(2026, 8, 5, 10),
      isAllDay: false,
    );
    expect(stub.creates, 1);

    await container.read(eventsForDayProvider('2026-08-05').future);
    expect(stub.listByDayCalls, 2); // 失效后重拉
  });

  test('actions.delete 后 todayCount 刷新', () async {
    final stub = _StubEventApi();
    final container = ProviderContainer(overrides: [eventApiProvider.overrideWithValue(stub)]);
    addTearDown(container.dispose);

    expect(await container.read(eventTodayCountProvider.future), 3);
    expect(stub.countCalls, 1);

    await container.read(eventActionsProvider).delete('e1');
    expect(stub.deleted, isTrue);

    await container.read(eventTodayCountProvider.future);
    expect(stub.countCalls, 2); // 失效后重拉
  });
}
