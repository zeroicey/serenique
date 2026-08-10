# Flutter 移动端 Event（日程）模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 apps/mobile 的 `/event` 占位页替换为真实日程页（单日列表 + 自绘月历弹窗跳转 + 新建/编辑/删除），交互与 Web 端对齐。

**Architecture:** 新增 `features/event/` 平铺模块：`event_models.dart`（EventEntry）+ `event_time.dart`（纯日期函数）→ `event_api.dart`（CRUD，复用 ApiClient）→ `event_providers.dart`（day/month 查询 + actions）→ `event_page.dart` + 4 个 widgets。日期语义关键：后端 ISO 带偏移、Dart `DateTime.parse` 归一化 UTC，展示前一律 `.toLocal()`。月历手写 7 列网格（不引组件库）。后端零改动。

**Tech Stack:** Flutter（Dart ^3.12.2）、Riverpod 3（`FutureProvider.family` + `Ref.invalidate`）、go_router、dio、intl（仅用 `showDatePicker`/`showTimePicker`，日期格式化手写）。

**Design doc:** `.ai/architecture/2026-08-10-flutter-event-module-design.md`

## Global Constraints

- 所有命令在 `apps/mobile/` 目录下执行；若 `flutter pub` 网络失败，先 `export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897`。
- 门禁：每次任务结束 `flutter analyze` + `flutter test` 全绿。
- API 契约以 `services/api/src/modules/event/event.types.ts` 为权威来源（`EventEntry`、裸数组列表、`z.iso.datetime({offset:true})`、PUT 部分更新、location/note 空串清空）。
- **时区语义（本模块最易踩坑，已实测）**：Dart `DateTime.parse("2026-08-05T10:00:00+08:00")` 返回 UTC（`isUtc=true`），展示/参与日期计算前必须先 `.toLocal()`。本 plan 所有 `eventTimeLabel`/`eventDayKeysInMonth`/编辑回填都遵守。
- 用户可见文案全中文；Commit message 英文 conventional style（`feat(mobile): ...` / `fix(mobile): ...`）。
- 不新增任何 pub 依赖，不引日历/组件库（月历手写）。
- 列表是**裸数组**：用 `data as List<dynamic>`，不要套 `unwrapItems`（那是 `{items,total}` 用的）。
- 测试约定：API 测试 mock Dio（`_FakeAdapter`/`_RecordingAdapter`，对齐 `moment_api_test.dart` / `api_client_test.dart`）；widget 测试用 `ProviderScope(overrides:)` 直接 override provider（对齐 `router_test.dart`）。
- **前置坑（Task 1 必修）**：后端 DELETE 返回 204 空 body（`Res.noContent` → `c.body(null, 204)`，无 Content-Type/无 body），移动端 `_guard` → `unwrapResponse` 对非 Map body 会抛 `BAD_RESPONSE`。这是个**潜在 bug**（moment/task/blob/event 所有删除都受影响，只是还没暴露）。Task 1 修复 `_guard` 对 204 跳过解包，顺带修好所有删除。

---

### Task 1: 修复 ApiClient 204 空 body（deleteData 前置修复）

**Files:**
- Modify: `apps/mobile/lib/core/network/api_client.dart:86-96`（`_guard` 内 `unwrapResponse` 之前）
- Test: `apps/mobile/test/core/network/api_client_test.dart`

**Interfaces:**
- Consumes: 现有 `ApiClient`/`unwrapResponse`。
- Produces: `_guard` 对 `res.statusCode == 204` 返回 `null`（不抛错）。所有 `deleteData` 调用现在能正常完成。

- [ ] **Step 1: 写失败测试**

`apps/mobile/test/core/network/api_client_test.dart` 末尾 `main()` 内追加：

```dart
  test('204 无 body：deleteData 返回 null 不抛 BAD_RESPONSE', () async {
    final client = ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = _FakeAdapter(204, ''),
    );
    expect(await client.deleteData('/api/events/e1'), isNull);
  });
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd apps/mobile
flutter test test/core/network/api_client_test.dart
```

期望：FAIL — 抛 `ApiException(BAD_RESPONSE, 响应格式错误)`（因为 `unwrapResponse('')` 对非 Map body 抛错）。

- [ ] **Step 3: 修复 `_guard`**

`apps/mobile/lib/core/network/api_client.dart`，`_guard` 方法内 `return unwrapResponse(res.data);` 之前插入一行：

```dart
    // 204 No Content：后端删除接口无 body，跳过统一解包（否则空串抛 BAD_RESPONSE）。
    if (res.statusCode == 204) return null;
    return unwrapResponse(res.data);
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/core/network/api_client_test.dart
```

期望：全 PASS（含既有 12 个用例 + 新加 1 个）。

- [ ] **Step 5: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/core/network/api_client.dart apps/mobile/test/core/network/api_client_test.dart
git commit -m "fix(mobile): handle 204 empty delete responses in ApiClient"
```

---

### Task 2: EventEntry 模型 + 纯日期函数

**Files:**
- Create: `apps/mobile/lib/features/event/event_models.dart`
- Create: `apps/mobile/lib/features/event/event_time.dart`（改写现有 `event_api.dart` 里的 `_withOffset` → 统一放这里）
- Test: `apps/mobile/test/features/event/event_models_test.dart`
- Test: `apps/mobile/test/features/event/event_time_test.dart`

**Interfaces:**
- Consumes: 无（底层）。
- Produces:
  - `event_models.dart`：`class EventEntry { String id/title/startAt/endAt/createdAt/updatedAt; bool isAllDay; String? location/note; }` + `fromJson`（时间保持 ISO 字符串，展示前 `.toLocal()`）。
  - `event_time.dart`：纯函数 `dayKey`/`monthKey`/`dayFromKey`/`todayKey`/`shiftDay`/`isSameDay`/`hhmm`/`md`/`dateLabel`/`withOffset`/`dayWindow`/`monthWindow`/`eventTimeLabel`/`sortEvents`/`eventDayKeysInMonth`。

- [ ] **Step 1: 写 EventEntry 模型**

`apps/mobile/lib/features/event/event_models.dart`：

```dart
/// 日程（Event）模块数据模型。时间字段保持 ISO 字符串（后端契约），
/// 展示前经 event_time.dart 的解析/格式化工具转本地时间。
class EventEntry {
  const EventEntry({
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.isAllDay,
    required this.createdAt,
    required this.updatedAt,
    this.location,
    this.note,
  });

  factory EventEntry.fromJson(Map<String, dynamic> json) => EventEntry(
        id: json['id'] as String,
        title: json['title'] as String,
        startAt: json['startAt'] as String,
        endAt: json['endAt'] as String,
        isAllDay: json['isAllDay'] as bool? ?? false,
        location: json['location'] as String?,
        note: json['note'] as String?,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );

  final String id;
  final String title;
  final String startAt;
  final String endAt;
  final bool isAllDay;
  final String? location;
  final String? note;
  final String createdAt;
  final String updatedAt;
}
```

- [ ] **Step 2: 写纯日期函数文件**

`apps/mobile/lib/features/event/event_time.dart`：

```dart
/// 纯日期工具：全部基于设备本地时区。日期键 = YYYY-MM-DD / YYYY-MM。
///
/// 关键坑（已实测）：Dart 的 DateTime.parse 对带偏移 ISO（如
/// "2026-08-05T10:00:00+08:00"）会归一化到 UTC（isUtc=true），
/// 展示前必须先 .toLocal()。本文件所有「解析后端 ISO → 格式化」都遵守。
import 'event_models.dart';

String dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String monthKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';

/// 日期键 → 本地当天 00:00。
DateTime dayFromKey(String key) {
  final p = key.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

String todayKey() => dayKey(DateTime.now());

String shiftDay(String key, int n) {
  final d = dayFromKey(key);
  return dayKey(DateTime(d.year, d.month, d.day + n));
}

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String hhmm(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

String md(DateTime t) => '${t.month}月${t.day}日';

String dateLabel(String key) {
  final d = dayFromKey(key);
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return '${md(d)} ${weekdays[d.weekday - 1]}';
}

/// 后端要求 ISO 带时区偏移（offset: true）。本地 DateTime 的
/// toIso8601String 无偏移，手动补 ±hh:mm。
String withOffset(DateTime t) {
  final offset = t.timeZoneOffset;
  final sign = offset.isNegative ? '-' : '+';
  final h = offset.inHours.abs().toString().padLeft(2, '0');
  final m = (offset.inMinutes.abs() % 60).toString().padLeft(2, '0');
  return '${t.toIso8601String()}$sign$h:$m';
}

(String, String) dayWindow(String day) {
  final d = dayFromKey(day);
  return (withOffset(d), withOffset(DateTime(d.year, d.month, d.day + 1)));
}

(String, String) monthWindow(String month) {
  final p = month.split('-');
  final year = int.parse(p[0]);
  final m = int.parse(p[1]);
  return (withOffset(DateTime(year, m, 1)), withOffset(DateTime(year, m + 1, 1)));
}

/// 事件时间标签：全天 → '全天'；同日 → 'HH:mm – HH:mm'；
/// 跨日 → 'M月d日 HH:mm – M月d日 HH:mm'。
String eventTimeLabel(EventEntry e) {
  if (e.isAllDay) return '全天';
  final start = DateTime.parse(e.startAt).toLocal();
  final end = DateTime.parse(e.endAt).toLocal();
  return isSameDay(start, end)
      ? '${hhmm(start)} – ${hhmm(end)}'
      : '${md(start)} ${hhmm(start)} – ${md(end)} ${hhmm(end)}';
}

/// 按开始时刻升序（跨时区偏移用时刻比较）。
List<EventEntry> sortEvents(Iterable<EventEntry> events) {
  final list = events.toList();
  list.sort((a, b) => DateTime.parse(a.startAt).compareTo(DateTime.parse(b.startAt)));
  return list;
}

/// 月内每天是否有日程：返回有日程的日期键集合（月历圆点用）。
/// 重叠判定对齐后端：日 D 被覆盖 ⇔ start < D+1 00:00 且 end > D 00:00。
Set<String> eventDayKeysInMonth(Iterable<EventEntry> events, String month) {
  final days = <String>{};
  final (fromIso, _) = monthWindow(month);
  final monthStart = DateTime.parse(fromIso).toLocal();
  final monthEnd = DateTime(monthStart.year, monthStart.month + 1, 1);
  for (final e in events) {
    final start = DateTime.parse(e.startAt).toLocal();
    final end = DateTime.parse(e.endAt).toLocal();
    var d = monthStart;
    while (d.isBefore(monthEnd)) {
      final dayEnd = DateTime(d.year, d.month, d.day + 1);
      if (start.isBefore(dayEnd) && end.isAfter(d)) days.add(dayKey(d));
      d = dayEnd;
    }
  }
  return days;
}
```

- [ ] **Step 3: 写模型单测**

`apps/mobile/test/features/event/event_models_test.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';

void main() {
  test('fromJson 全字段', () {
    final e = EventEntry.fromJson({
      'id': 'e1',
      'title': '晨会',
      'startAt': '2026-08-05T09:00:00+08:00',
      'endAt': '2026-08-05T10:00:00+08:00',
      'isAllDay': false,
      'location': '会议室',
      'note': '带笔',
      'createdAt': 't1',
      'updatedAt': 't2',
    });
    expect(e.title, '晨会');
    expect(e.location, '会议室');
    expect(e.isAllDay, isFalse);
  });

  test('fromJson 缺字段回退默认值', () {
    final e = EventEntry.fromJson({
      'id': 'e2',
      'title': '全天',
      'startAt': '2026-08-05T00:00:00+08:00',
      'endAt': '2026-08-05T23:59:59+08:00',
      'createdAt': 't1',
      'updatedAt': 't2',
    });
    expect(e.isAllDay, isFalse); // 默认 false
    expect(e.location, isNull);
    expect(e.note, isNull);
  });
}
```

- [ ] **Step 4: 写纯日期函数单测**

`apps/mobile/test/features/event/event_time_test.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

EventEntry entry(String startAt, String endAt, {bool isAllDay = false}) =>
    EventEntry(
      id: 'x', title: 'x', startAt: startAt, endAt: endAt,
      isAllDay: isAllDay, createdAt: 't', updatedAt: 't',
    );

void main() {
  group('withOffset：补本地偏移', () {
    test('格式带 ±hh:mm', () {
      final t = DateTime(2026, 8, 5, 10, 30);
      final s = withOffset(t);
      final offset = t.timeZoneOffset;
      final sign = offset.isNegative ? '-' : '+';
      final h = offset.inHours.abs().toString().padLeft(2, '0');
      final m = (offset.inMinutes.abs() % 60).toString().padLeft(2, '0');
      expect(s, '2026-08-05T10:30:00.000$sign$h:$m');
    });
  });

  group('dayKey / monthKey / dayFromKey 往返', () {
    test('dayKey 往返', () {
      final d = DateTime(2026, 8, 12);
      expect(dayFromKey(dayKey(d)), d);
    });
    test('monthKey', () {
      expect(monthKey(DateTime(2026, 8, 12)), '2026-08');
      expect(monthKey(DateTime(2026, 12, 1)), '2026-12');
    });
  });

  group('dayWindow / monthWindow 本地日界', () {
    test('dayWindow [00:00, 次日 00:00)', () {
      final (from, to) = dayWindow('2026-08-12');
      expect(DateTime.parse(from).toLocal(), DateTime(2026, 8, 12));
      expect(DateTime.parse(to).toLocal(), DateTime(2026, 8, 13));
    });
    test('monthWindow [1号, 下月1号) 跨月', () {
      final (from, to) = monthWindow('2026-08');
      expect(DateTime.parse(from).toLocal(), DateTime(2026, 8, 1));
      expect(DateTime.parse(to).toLocal(), DateTime(2026, 9, 1));
    });
    test('monthWindow 12 月跨次年', () {
      final (_, to) = monthWindow('2026-12');
      expect(DateTime.parse(to).toLocal(), DateTime(2027, 1, 1));
    });
  });

  test('shiftDay 跨月边界', () {
    expect(shiftDay('2026-08-31', 1), '2026-09-01');
    expect(shiftDay('2026-08-01', -1), '2026-07-31');
    expect(shiftDay('2026-12-31', 1), '2027-01-01');
  });

  group('eventTimeLabel 三态', () {
    test('全天 → "全天"', () {
      expect(eventTimeLabel(entry('', '', isAllDay: true)), '全天');
    });
    test('同日时段 → "HH:mm – HH:mm"', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 5, 9, 0)),
        withOffset(DateTime(2026, 8, 5, 10, 30)),
      );
      expect(eventTimeLabel(e), '09:00 – 10:30');
    });
    test('跨日 → "M月d日 HH:mm – M月d日 HH:mm"', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 5, 23, 0)),
        withOffset(DateTime(2026, 8, 6, 1, 0)),
      );
      expect(eventTimeLabel(e), '8月5日 23:00 – 8月6日 01:00');
    });
  });

  group('sortEvents 按时刻升序', () {
    test('同日按时间', () {
      final a = entry(withOffset(DateTime(2026, 8, 5, 10, 0)), withOffset(DateTime(2026, 8, 5, 11, 0)));
      final b = entry(withOffset(DateTime(2026, 8, 5, 9, 0)), withOffset(DateTime(2026, 8, 5, 10, 0)));
      expect(sortEvents([a, b]).map((e) => e.startAt), [b.startAt, a.startAt]);
    });
  });

  group('eventDayKeysInMonth 圆点', () {
    test('单日事件标记该日', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 12, 9, 0)),
        withOffset(DateTime(2026, 8, 12, 10, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-12'});
    });
    test('跨日事件标记所有重叠日', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 12, 23, 0)),
        withOffset(DateTime(2026, 8, 14, 1, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-12', '2026-08-13', '2026-08-14'});
    });
    test('事件结束在当日 00:00 不标记该日（严格小于）', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 11, 22, 0)),
        withOffset(DateTime(2026, 8, 12, 0, 0)),
      );
      final dots = eventDayKeysInMonth([e], '2026-08');
      expect(dots, contains('2026-08-11'));
      expect(dots, isNot(contains('2026-08-12')));
    });
    test('跨月边界：上月事件延伸到本月 1 号', () {
      final e = entry(
        withOffset(DateTime(2026, 7, 31, 23, 0)),
        withOffset(DateTime(2026, 8, 1, 1, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-01'});
    });
  });

  test('dateLabel 含星期', () {
    // 2026-08-12 是周三（2026-08-10 周一，可手动算）
    expect(dateLabel('2026-08-12'), '8月12日 周三');
    expect(dateLabel('2026-08-10'), '8月10日 周一');
    expect(dateLabel('2026-08-09'), '8月9日 周日');
  });
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/event/
```

期望：全 PASS。

- [ ] **Step 6: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/event/event_models.dart apps/mobile/lib/features/event/event_time.dart apps/mobile/test/features/event/
git commit -m "feat(mobile): add event model and pure date/time utilities"
```

---

### Task 3: EventApi CRUD 封装（扩展现有）

**Files:**
- Modify: `apps/mobile/lib/features/event/event_api.dart`（把 `countToday` 改用 `event_time.dart` 的 `withOffset`，新增 listRange/listByDay/create/update/delete）
- Test: `apps/mobile/test/features/event/event_api_test.dart`

**Interfaces:**
- Consumes: `EventEntry`（Task 2）、`event_time.dart`（Task 2）、`ApiClient`。
- Produces: `class EventApi { Future<int> countToday(); Future<List<EventEntry>> listRange({required String from, required String to}); Future<List<EventEntry>> listByDay(String day); Future<EventEntry> create({required String title, required DateTime startAt, required DateTime endAt, required bool isAllDay, String location = '', String note = ''}); Future<EventEntry> update(String id, {...同上}); Future<void> delete(String id); }`

- [ ] **Step 1: 重写 event_api.dart**

`apps/mobile/lib/features/event/event_api.dart`（整体替换）：

```dart
import '../../../core/network/api_client.dart';
import 'event_models.dart';
import 'event_time.dart';

/// 日历（Event）模块的 HTTP 封装。
class EventApi {
  EventApi(this._client);

  final ApiClient _client;

  /// 今天的事件数：本地日窗 [今天00:00, 明天00:00)，数裸数组长度。
  Future<int> countToday() async {
    final day = todayKey();
    final (from, to) = dayWindow(day);
    final data = await _client.getData('/api/events', query: {'from': from, 'to': to});
    return (data as List<dynamic>).length;
  }

  /// 时间窗内事件（裸数组）。后端重叠语义 [from, to)。
  Future<List<EventEntry>> listRange({required String from, required String to}) async {
    final data = await _client.getData('/api/events', query: {'from': from, 'to': to});
    return (data as List<dynamic>)
        .map((e) => EventEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 某日事件（本地日窗）。
  Future<List<EventEntry>> listByDay(String day) async {
    final (from, to) = dayWindow(day);
    return listRange(from: from, to: to);
  }

  /// location/note 传空串即置空（对齐后端：z.string().trim().optional() 接受空串）。
  Future<EventEntry> create({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    final data = await _client.postData('/api/events', body: {
      'title': title,
      'startAt': withOffset(startAt),
      'endAt': withOffset(endAt),
      'isAllDay': isAllDay,
      'location': location,
      'note': note,
    });
    return EventEntry.fromJson(data as Map<String, dynamic>);
  }

  /// 全量更新（后端部分更新语义完全兼容）；location/note 空串即清空。
  Future<EventEntry> update(
    String id, {
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    final data = await _client.putData('/api/events/$id', body: {
      'title': title,
      'startAt': withOffset(startAt),
      'endAt': withOffset(endAt),
      'isAllDay': isAllDay,
      'location': location,
      'note': note,
    });
    return EventEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async => _client.deleteData('/api/events/$id');
}
```

- [ ] **Step 2: 写 API 单测（mock Dio）**

`apps/mobile/test/features/event/event_api_test.dart`：

```dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/event/event_api.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
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
```

- [ ] **Step 3: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/event/
```

期望：全 PASS（Task 2 + Task 3 全部用例）。

- [ ] **Step 4: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/event/event_api.dart apps/mobile/test/features/event/event_api_test.dart
git commit -m "feat(mobile): add event API CRUD client"
```

---

### Task 4: Event providers（day/month/count + actions）

**Files:**
- Modify: `apps/mobile/lib/features/event/event_providers.dart`
- Test: `apps/mobile/test/features/event/event_providers_test.dart`

**Interfaces:**
- Consumes: `EventApi`（Task 3）、`EventEntry`/`event_time.dart`（Task 2）。
- Produces:
  - `eventApiProvider = Provider<EventApi>`
  - `eventsForDayProvider = FutureProvider.family<List<EventEntry>, String>`（YYYY-MM-DD）
  - `eventsInMonthProvider = FutureProvider.family<List<EventEntry>, String>`（YYYY-MM）
  - `eventTodayCountProvider = FutureProvider<int>`
  - `class EventActions { create/update/delete + _invalidateAll() }`
  - `eventActionsProvider = Provider<EventActions>`

- [ ] **Step 1: 重写 event_providers.dart**

`apps/mobile/lib/features/event/event_providers.dart`（整体替换）：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'event_api.dart';
import 'event_models.dart';
import 'event_time.dart';

final eventApiProvider = Provider<EventApi>((ref) => EventApi(ref.watch(apiClientProvider)));

/// 某日事件（family 按 YYYY-MM-DD 缓存，单日列表用）。
final eventsForDayProvider = FutureProvider.family<List<EventEntry>, String>(
  (ref, day) => ref.watch(eventApiProvider).listByDay(day),
);

/// 某月事件（family 按 YYYY-MM 缓存，月历圆点用）。
final eventsInMonthProvider = FutureProvider.family<List<EventEntry>, String>(
  (ref, month) async {
    final (from, to) = monthWindow(month);
    return ref.watch(eventApiProvider).listRange(from: from, to: to);
  },
);

/// 今天事件数（抽屉徽标）。
final eventTodayCountProvider = FutureProvider<int>(
  (ref) => ref.watch(eventApiProvider).countToday(),
);

/// 写操作集中处：成功后整体失效 day/month/count（对齐 Web invalidateQueries(['events'])）。
class EventActions {
  EventActions(this._ref);

  final Ref _ref;
  EventApi get _api => _ref.read(eventApiProvider);

  Future<EventEntry> create({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    final e = await _api.create(
      title: title, startAt: startAt, endAt: endAt, isAllDay: isAllDay,
      location: location, note: note,
    );
    _invalidateAll();
    return e;
  }

  Future<EventEntry> update(
    String id, {
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    final e = await _api.update(
      id, title: title, startAt: startAt, endAt: endAt, isAllDay: isAllDay,
      location: location, note: note,
    );
    _invalidateAll();
    return e;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _invalidateAll();
  }

  void _invalidateAll() {
    _ref.invalidate(eventsForDayProvider);
    _ref.invalidate(eventsInMonthProvider);
    _ref.invalidate(eventTodayCountProvider);
  }
}

final eventActionsProvider = Provider<EventActions>((ref) => EventActions(ref));
```

- [ ] **Step 2: 写 provider 单测（stub EventApi 验证缓存 + 失效）**

`apps/mobile/test/features/event/event_providers_test.dart`：

```dart
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
```

> 注意：这个测试会**验证** `ref.invalidate(family)` 是否真的让已实例化的 family 失效。若跑出来 `listByDayCalls` 仍是 1（失效未生效），说明该 Riverpod 版本对 family 整体 invalidate 的行为需要换成「带参数逐个 invalidate 或改用 Notifier」——到时按失败断言调整 `_invalidateAll` 实现（例如额外 `_ref.invalidate(eventsForDayProvider(当前day))` 之类），测试本身不改。

- [ ] **Step 3: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/event/
```

期望：全 PASS。

- [ ] **Step 4: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/event/event_providers.dart apps/mobile/test/features/event/event_providers_test.dart
git commit -m "feat(mobile): add event providers with day/month queries"
```

---

### Task 5: 事件卡片 + 编辑弹窗

**Files:**
- Create: `apps/mobile/lib/features/event/widgets/event_tile.dart`
- Create: `apps/mobile/lib/features/event/widgets/event_edit_sheet.dart`
- Test: `apps/mobile/test/features/event/event_tile_test.dart`
- Test: `apps/mobile/test/features/event/event_edit_sheet_test.dart`

**Interfaces:**
- Consumes: `EventEntry`/`event_time.dart`（Task 2）、`eventActionsProvider`（Task 4）。
- Produces: `EventTile({required EventEntry event, required VoidCallback onEdit, required VoidCallback onDelete})`；`Future<void> showEventEditSheet(BuildContext context, {String? day, EventEntry? event})`。

- [ ] **Step 1: 写事件卡片**

`apps/mobile/lib/features/event/widgets/event_tile.dart`：

```dart
// 事件卡片：时间列（全天徽标 / 时段 / 跨日）+ 标题/地点/备注 + ⋯ 菜单（编辑/删除）。
// 删除确认由调用方（页面）负责，本组件只发 onDelete 回调。
import 'package:flutter/material.dart';
import '../event_models.dart';
import '../event_time.dart';

class EventTile extends StatefulWidget {
  const EventTile({
    super.key,
    required this.event,
    required this.onEdit,
    required this.onDelete,
  });

  final EventEntry event;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  State<EventTile> createState() => _EventTileState();
}

class _EventTileState extends State<EventTile> {
  static const _noteTruncate = 150;
  bool _noteExpanded = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final e = widget.event;
    final note = e.note ?? '';
    final showToggle = note.length > _noteTruncate;
    final shownNote = showToggle && !_noteExpanded ? '${note.substring(0, _noteTruncate)}…' : note;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 104,
            child: e.isAllDay
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: scheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('全天',
                          style: TextStyle(fontSize: 12, color: scheme.onSecondaryContainer)),
                    ),
                  )
                : Text(
                    eventTimeLabel(e),
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, height: 1.3),
                  ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(e.title,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    ),
                    PopupMenuButton<String>(
                      tooltip: '日程操作',
                      onSelected: (v) => v == 'edit' ? widget.onEdit() : widget.onDelete(),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'edit', child: Text('编辑')),
                        PopupMenuItem(value: 'delete', child: Text('删除')),
                      ],
                    ),
                  ],
                ),
                if (e.location != null && e.location!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(children: [
                      Icon(Icons.place_outlined, size: 13, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(e.location!,
                            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                      ),
                    ]),
                  ),
                if (shownNote.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(shownNote,
                        style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, height: 1.4)),
                  ),
                if (showToggle)
                  GestureDetector(
                    onTap: () => setState(() => _noteExpanded = !_noteExpanded),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(_noteExpanded ? '收起' : '展开',
                          style: TextStyle(fontSize: 12, color: scheme.primary)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 写编辑弹窗**

`apps/mobile/lib/features/event/widgets/event_edit_sheet.dart`：

```dart
// 日程新建/编辑合一底部弹窗：标题 / 全天 / 开始 / 结束 / 地点 / 备注。
// [day] 预填创建日期（新建）；[event] 非空 = 编辑。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../event_models.dart';
import '../event_providers.dart';
import '../event_time.dart';

Future<void> showEventEditSheet(
  BuildContext context, {
  String? day,
  EventEntry? event,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _EventEditSheet(day: day, event: event),
    ),
  );
}

class _EventEditSheet extends ConsumerStatefulWidget {
  const _EventEditSheet({this.day, this.event});

  final String? day;
  final EventEntry? event;

  @override
  ConsumerState<_EventEditSheet> createState() => _EventEditSheetState();
}

class _EventEditSheetState extends ConsumerState<_EventEditSheet> {
  late final TextEditingController _title =
      TextEditingController(text: widget.event?.title ?? '');
  late final TextEditingController _location =
      TextEditingController(text: widget.event?.location ?? '');
  late final TextEditingController _note =
      TextEditingController(text: widget.event?.note ?? '');
  late bool _allDay;
  late DateTime _start;
  late DateTime _end;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final editing = widget.event;
    if (editing != null) {
      // 后端 ISO 归一化 UTC，回填前必须 .toLocal()。
      _allDay = editing.isAllDay;
      _start = DateTime.parse(editing.startAt).toLocal();
      _end = DateTime.parse(editing.endAt).toLocal();
    } else {
      final d = dayFromKey(widget.day ?? todayKey());
      _allDay = false;
      _start = DateTime(d.year, d.month, d.day, 9);
      _end = DateTime(d.year, d.month, d.day, 10);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _note.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<DateTime?> _pickDateTime(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<DateTime?> _pickDate(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null) return null;
    return DateTime(date.year, date.month, date.day);
  }

  Future<void> _pickStart() async {
    final picked = _allDay ? await _pickDate(_start) : await _pickDateTime(_start);
    if (picked == null || !mounted) return;
    setState(() {
      _start = picked;
      if (!_end.isAfter(_start)) _end = _start.add(const Duration(hours: 1));
    });
  }

  Future<void> _pickEnd() async {
    final picked = _allDay ? await _pickDate(_end) : await _pickDateTime(_end);
    if (picked == null || !mounted) return;
    setState(() => _end = picked);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.event == null ? '新建日程' : '编辑日程',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: '标题', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('全天'),
              value: _allDay,
              onChanged: (v) => setState(() => _allDay = v),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.flag_outlined),
              title: const Text('开始'),
              subtitle: Text(_allDay ? md(_start) : hhmm(_start)),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickStart,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.flag),
              title: const Text('结束'),
              subtitle: Text(_allDay ? md(_end) : hhmm(_end)),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickEnd,
            ),
            TextField(
              controller: _location,
              decoration: const InputDecoration(labelText: '地点（可选）', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: '备注（可选）', border: OutlineInputBorder()),
              maxLines: 3,
              maxLength: 2000,
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(widget.event == null ? '创建' : '保存'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      _snack('请输入日程标题');
      return;
    }
    final startDay = DateTime(_start.year, _start.month, _start.day);
    final endDay = DateTime(_end.year, _end.month, _end.day);
    if (_allDay) {
      if (endDay.isBefore(startDay)) {
        _snack('结束时间必须晚于开始时间');
        return;
      }
    } else if (!_end.isAfter(_start)) {
      _snack('结束时间必须晚于开始时间');
      return;
    }
    // 全天：存日期 00:00 / 23:59:59（对齐 Web）。
    final startAt = _allDay ? startDay : _start;
    final endAt = _allDay ? DateTime(endDay.year, endDay.month, endDay.day, 23, 59, 59) : _end;
    final actions = ref.read(eventActionsProvider);
    setState(() => _submitting = true);
    try {
      if (widget.event == null) {
        await actions.create(
          title: title,
          startAt: startAt,
          endAt: endAt,
          isAllDay: _allDay,
          location: _location.text.trim(),
          note: _note.text.trim(),
        );
      } else {
        await actions.update(
          widget.event!.id,
          title: title,
          startAt: startAt,
          endAt: endAt,
          isAllDay: _allDay,
          location: _location.text.trim(),
          note: _note.text.trim(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(humanizeError(e));
    }
  }
}
```

- [ ] **Step 3: 写事件卡片 widget 测试**

`apps/mobile/test/features/event/event_tile_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/event_tile.dart';

EventEntry entry({
  required String title,
  bool isAllDay = false,
  String? location,
  String? note,
  int startHour = 9,
}) =>
    EventEntry(
      id: 'e1',
      title: title,
      startAt: withOffset(DateTime(2026, 8, 5, startHour, 0)),
      endAt: withOffset(DateTime(2026, 8, 5, startHour + 1, 0)),
      isAllDay: isAllDay,
      location: location,
      note: note,
      createdAt: 't',
      updatedAt: 't',
    );

void main() {
  testWidgets('全天徽标：isAllDay 显示「全天」而非时间', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(event: entry(title: '出差', isAllDay: true), onEdit: () {}, onDelete: () {}),
      ),
    ));
    expect(find.text('全天'), findsOneWidget);
    expect(find.textContaining('–'), findsNothing);
  });

  testWidgets('时段事件：显示 HH:mm – HH:mm', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(event: entry(title: '晨会', startHour: 9), onEdit: () {}, onDelete: () {}),
      ),
    ));
    expect(find.text('09:00 – 10:00'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget);
  });

  testWidgets('地点展示；长备注截断后可展开/收起', (tester) async {
    final longNote = '备注' * 100; // 200 字 > 150
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(
          event: entry(title: 'x', location: '会议室', note: longNote),
          onEdit: () {},
          onDelete: () {},
        ),
      ),
    ));
    expect(find.text('会议室'), findsOneWidget);
    expect(find.text('展开'), findsOneWidget);
    expect(find.textContaining('…'), findsOneWidget);

    await tester.tap(find.text('展开'));
    await tester.pumpAndSettle();
    expect(find.text('收起'), findsOneWidget);
    expect(find.textContaining('备注'), findsWidgets);
  });

  testWidgets('⋯ 菜单：编辑触发 onEdit、删除触发 onDelete', (tester) async {
    var edited = false;
    var deleted = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(
          event: entry(title: 'x'),
          onEdit: () => edited = true,
          onDelete: () => deleted = true,
        ),
      ),
    ));
    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    expect(find.text('编辑'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);

    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();
    expect(edited, isTrue);

    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    expect(deleted, isTrue);
  });
}
```

- [ ] **Step 4: 写编辑弹窗 widget 测试**

`apps/mobile/test/features/event/event_edit_sheet_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/widgets/event_edit_sheet.dart';

/// 记录动作的 EventActions 假实现（EventActions 方法默认虚，可覆写）。
class _RecordingActions extends EventActions {
  _RecordingActions(super.ref);

  final List<Map<String, Object?>> created = [];
  int updates = 0;

  static final _entry = EventEntry(
    id: 'e1', title: 'x',
    startAt: '2026-08-05T09:00:00+08:00', endAt: '2026-08-05T10:00:00+08:00',
    isAllDay: false, createdAt: 't', updatedAt: 't',
  );

  @override
  Future<EventEntry> create({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    created.add({
      'title': title, 'startAt': startAt, 'endAt': endAt,
      'isAllDay': isAllDay, 'location': location, 'note': note,
    });
    return _entry;
  }

  @override
  Future<EventEntry> update(
    String id, {
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    updates++;
    return _entry;
  }
}

void main() {
  testWidgets('新建提交：默认选中日 09:00-10:00，create 收到全字段', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '标题'), '晨会');
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    final recorded = container.read(eventActionsProvider).created.single;
    expect(recorded['title'], '晨会');
    expect(recorded['isAllDay'], isFalse);
    final start = recorded['startAt'] as DateTime;
    expect(start.year, 2026);
    expect(start.month, 8);
    expect(start.day, 12);
    expect(start.hour, 9);
  });

  testWidgets('全天切换：开始/结束副标题变日期格式', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('09:00'), findsOneWidget); // 时段模式
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.text('8月12日'), findsNWidgets(2)); // 开始/结束都显示日期
    expect(find.text('09:00'), findsNothing);
  });

  testWidgets('全天结束早于开始：SnackBar 拦截、不调 create', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '标题'), 'x');
    await tester.tap(find.byType(Switch)); // 全天
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '结束')); // 结束日期选择器
    await tester.pumpAndSettle();
    await tester.tap(find.text('11')); // 选 8/11（早于开始 8/12）
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); // 确认（无 zh 本地化时是 OK）
    await tester.pumpAndSettle();
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    expect(find.text('结束时间必须晚于开始时间'), findsOneWidget);
    expect(container.read(eventActionsProvider).created, isEmpty);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('编辑回填：标题/地点/备注预填，保存走 update', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    final editing = EventEntry(
      id: 'e1',
      title: '晨会',
      startAt: '2026-08-05T09:00:00+08:00',
      endAt: '2026-08-05T10:00:00+08:00',
      isAllDay: false,
      location: '会议室',
      note: '带笔',
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showEventEditSheet(context, event: editing),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('编辑日程'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget); // 标题回填
    expect(find.text('会议室'), findsOneWidget); // 地点回填
    expect(find.text('带笔'), findsOneWidget); // 备注回填
    expect(find.text('09:00'), findsOneWidget); // 开始时间回填

    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(container.read(eventActionsProvider).updates, 1);
  });

  testWidgets('标题为空：SnackBar 拦截、不调 create', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    expect(find.text('请输入日程标题'), findsOneWidget);
    expect(container.read(eventActionsProvider).created, isEmpty);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
```

> 注意：`find.widgetWithText(TextField, '标题')` 取的是 `InputDecoration.labelText == '标题'` 的 TextField。若 `find.text('标题')` 匹配不到（labelText 是渲染后文本，可以），改用 `find.widgetWithText(TextField, '标题')` 已覆盖。`showEventEditSheet` 的确认按钮在无 `flutter_localizations` 时显示英文 `OK`；若项目后来加了 zh 本地化，把测试里的 `'OK'` 换成 `'确定'`。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/event/
```

期望：全 PASS。

- [ ] **Step 6: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/event/widgets/ apps/mobile/test/features/event/event_tile_test.dart apps/mobile/test/features/event/event_edit_sheet_test.dart
git commit -m "feat(mobile): add event tile and edit sheet"
```

---

### Task 6: 月历弹窗 + 日期导航

**Files:**
- Create: `apps/mobile/lib/features/event/widgets/month_calendar_sheet.dart`
- Create: `apps/mobile/lib/features/event/widgets/event_date_nav.dart`
- Test: `apps/mobile/test/features/event/month_calendar_sheet_test.dart`

**Interfaces:**
- Consumes: `eventsInMonthProvider`（Task 4）、`event_time.dart`（Task 2）。
- Produces: `Future<String?> showMonthCalendarSheet(BuildContext context, {required String initialDay})`（返回所选 dayKey）；`EventDateNav({required String selectedDay, required ValueChanged<String> onChanged, required VoidCallback onPickDate})`。

- [ ] **Step 1: 写月历弹窗**

`apps/mobile/lib/features/event/widgets/month_calendar_sheet.dart`：

```dart
// 自绘月历弹窗：单日跳转入口。带日程圆点、今天/选中态、‹›与横滑切月。
// 周一开头；相邻月灰色数字可点（直接跳到该日）。点选日期 → pop(dayKey)。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../event_models.dart';
import '../event_providers.dart';
import '../event_time.dart';

Future<String?> showMonthCalendarSheet(BuildContext context, {required String initialDay}) {
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (_) => MonthCalendarSheet(initialDay: initialDay),
  );
}

class MonthCalendarSheet extends ConsumerStatefulWidget {
  const MonthCalendarSheet({super.key, required this.initialDay});

  final String initialDay;

  @override
  ConsumerState<MonthCalendarSheet> createState() => _MonthCalendarSheetState();
}

class _MonthCalendarSheetState extends ConsumerState<MonthCalendarSheet> {
  static const _weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  late DateTime _month; // 显示月份（该月 1 号）
  late String _selectedDay;

  @override
  void initState() {
    super.initState();
    final d = dayFromKey(widget.initialDay);
    _month = DateTime(d.year, d.month, 1);
    _selectedDay = widget.initialDay;
  }

  void _shiftMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta, 1));
  }

  void _goToday() => Navigator.of(context).pop(todayKey());

  void _select(DateTime day) => Navigator.of(context).pop(dayKey(day));

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final events =
        ref.watch(eventsInMonthProvider(monthKey(_month))).valueOrNull ?? const <EventEntry>[];
    final dots = eventDayKeysInMonth(events, monthKey(_month));
    final today = todayKey();
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final leading = DateTime(_month.year, _month.month, 1).weekday - 1; // 周一开头

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              IconButton(
                  icon: const Icon(Icons.chevron_left), onPressed: () => _shiftMonth(-1)),
              Expanded(
                child: Center(
                  child: Text('${_month.year}年${_month.month}月',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ),
              TextButton(onPressed: _goToday, child: const Text('今天')),
              IconButton(
                  icon: const Icon(Icons.chevron_right), onPressed: () => _shiftMonth(1)),
            ]),
            Row(
              children: [
                for (final w in _weekdayLabels)
                  Expanded(
                    child: Center(
                      child: Text(w,
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            GestureDetector(
              onHorizontalDragEnd: (details) {
                final v = details.primaryVelocity ?? 0;
                if (v < -100) _shiftMonth(1);
                if (v > 100) _shiftMonth(-1);
              },
              child: GridView.count(
                crossAxisCount: 7,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < 42; i++) // 固定 6 行，高度稳定
                    _cell(i - leading + 1, daysInMonth, today, dots, scheme),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(int dayNumber, int daysInMonth, String today, Set<String> dots, ColorScheme scheme) {
    final day = DateTime(_month.year, _month.month, dayNumber); // Dart 自动归一化越界日
    final key = dayKey(day);
    final inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    final isToday = key == today;
    final isSelected = key == _selectedDay;
    final hasEvents = dots.contains(key);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => _select(day),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isToday
                  ? scheme.primary
                  : isSelected
                      ? scheme.primaryContainer
                      : null,
            ),
            child: Text(
              '${day.day}',
              style: TextStyle(
                fontSize: 14,
                color: inMonth
                    ? (isToday ? scheme.onPrimary : scheme.onSurface)
                    : scheme.outlineVariant,
                fontWeight: isToday || isSelected ? FontWeight.w600 : null,
              ),
            ),
          ),
          SizedBox(
            height: 4,
            child: hasEvents
                ? Center(
                    child: Container(
                      key: ValueKey('dot-$key'),
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primary),
                    ),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 写日期导航**

`apps/mobile/lib/features/event/widgets/event_date_nav.dart`：

```dart
// 日期导航栏：◀ 日期（点开月历） 今天 ▶。
import 'package:flutter/material.dart';
import '../event_time.dart';

class EventDateNav extends StatelessWidget {
  const EventDateNav({
    super.key,
    required this.selectedDay,
    required this.onChanged,
    required this.onPickDate,
  });

  final String selectedDay;
  final ValueChanged<String> onChanged;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context) {
    final isToday = selectedDay == todayKey();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: '前一天',
            onPressed: () => onChanged(shiftDay(selectedDay, -1)),
          ),
          Expanded(
            child: InkWell(
              onTap: onPickDate,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(
                  dateLabel(selectedDay),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
          TextButton(
            onPressed: isToday ? null : () => onChanged(todayKey()),
            child: const Text('今天'),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: '后一天',
            onPressed: () => onChanged(shiftDay(selectedDay, 1)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 3: 写月历弹窗 widget 测试**

`apps/mobile/test/features/event/month_calendar_sheet_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/month_calendar_sheet.dart';

void main() {
  ProviderContainer container({List<EventEntry> monthEvents = const []}) => ProviderContainer(
        overrides: [
          eventsInMonthProvider.overrideWith((ref, month) async => monthEvents),
        ],
      );

  /// 挂载 host（打开按钮 + 捕获 sheet future），对齐 session_sheet_test 的 inline 模式。
  Future<Future<String?> Function()> host(WidgetTester tester, ProviderContainer c) async {
    late Future<String?> future;
    await tester.pumpWidget(UncontrolledProviderScope(
      container: c,
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  future = showMonthCalendarSheet(context, initialDay: '2026-08-12');
                },
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    return () => future;
  }

  testWidgets('网格渲染当前月 + 点选日返回 dayKey', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    final sheet = await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('2026年8月'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    expect(find.text('31'), findsOneWidget);

    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    expect(await sheet(), '2026-08-15');
  });

  testWidgets('日程圆点：有事件的日子带圆点 key', (tester) async {
    final c = container(monthEvents: [
      EventEntry(
        id: 'e1', title: 'x',
        startAt: withOffset(DateTime(2026, 8, 5, 9)),
        endAt: withOffset(DateTime(2026, 8, 5, 10)),
        isAllDay: false, createdAt: 't', updatedAt: 't',
      ),
    ]);
    addTearDown(c.dispose);
    await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('dot-2026-08-05')), findsOneWidget);
    expect(find.byKey(const ValueKey('dot-2026-08-06')), findsNothing);
  });

  testWidgets('切月：chevron_right 显示下月，今天按钮 pop today', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    final sheet = await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.chevron_right));
    await tester.pumpAndSettle();
    expect(find.text('2026年9月'), findsOneWidget);

    await tester.tap(find.text('今天'));
    await tester.pumpAndSettle();
    expect(await sheet(), todayKey());
  });
}
```

> 注意：`host()` 只挂载 + 返回 future 读取函数，不自动点开；`future` 在 `onPressed` 里才赋值，`await sheet()` 必须在 `tap('打开')` 之后调用。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/event/
```

期望：全 PASS。

- [ ] **Step 5: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/event/widgets/month_calendar_sheet.dart apps/mobile/lib/features/event/widgets/event_date_nav.dart apps/mobile/test/features/event/month_calendar_sheet_test.dart
git commit -m "feat(mobile): add month calendar sheet and date nav"
```

---

### Task 7: 日程页面 + 接线（路由 / 抽屉徽标）

**Files:**
- Create: `apps/mobile/lib/features/event/event_page.dart`
- Modify: `apps/mobile/lib/router.dart`（`/event` → `EventPage`）
- Modify: `apps/mobile/lib/app_shell.dart`（`/event` 徽标接 `eventTodayCountProvider`，替换写死的 `'2'`）
- Test: `apps/mobile/test/features/event/event_page_test.dart`
- Modify: `apps/mobile/test/router_test.dart`（新增 `/event` 渲染真实页用例）

**Interfaces:**
- Consumes: `eventsForDayProvider`/`eventActionsProvider`（Task 4）、`EventTile`/`showEventEditSheet`（Task 5）、`MonthCalendarSheet`/`EventDateNav`（Task 6）、`AsyncErrorView`（`shared/widgets/async_view.dart`）、`humanizeError`（`core/network/api_exception.dart`）。
- Produces: `EventPage`（ConsumerStatefulWidget）。

- [ ] **Step 1: 写日程页面**

`apps/mobile/lib/features/event/event_page.dart`：

```dart
// 日程主页面：日期导航 + 当日事件列表 + FAB 新建。日期跳转经自绘月历弹窗。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'event_models.dart';
import 'event_providers.dart';
import 'event_time.dart';
import 'widgets/event_date_nav.dart';
import 'widgets/event_edit_sheet.dart';
import 'widgets/event_tile.dart';
import 'widgets/month_calendar_sheet.dart';

class EventPage extends ConsumerStatefulWidget {
  const EventPage({super.key});

  @override
  ConsumerState<EventPage> createState() => _EventPageState();
}

class _EventPageState extends ConsumerState<EventPage> {
  String _selectedDay = todayKey();

  void _onDayChanged(String day) => setState(() => _selectedDay = day);

  Future<void> _pickDate() async {
    final day = await showMonthCalendarSheet(context, initialDay: _selectedDay);
    if (day != null && mounted) _onDayChanged(day);
  }

  void _openCreate() => showEventEditSheet(context, day: _selectedDay);

  void _openEdit(EventEntry e) => showEventEditSheet(context, event: e);

  Future<void> _confirmDelete(EventEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除日程'),
        content: Text('确定删除「${e.title}」吗？删除后不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(eventActionsProvider).delete(e.id);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(humanizeError(err))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(eventsForDayProvider(_selectedDay));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(eventsForDayProvider(_selectedDay).future),
        child: Column(
          children: [
            EventDateNav(
              selectedDay: _selectedDay,
              onChanged: _onDayChanged,
              onPickDate: _pickDate,
            ),
            const Divider(height: 1),
            Expanded(
              child: events.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => AsyncErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(eventsForDayProvider(_selectedDay)),
                ),
                data: (items) {
                  final sorted = sortEvents(items);
                  if (sorted.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [ListTile(title: Text('这天没有日程'))],
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: sorted.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: 1, indent: 16, endIndent: 16),
                    itemBuilder: (context, index) {
                      final e = sorted[index];
                      return EventTile(
                        event: e,
                        onEdit: () => _openEdit(e),
                        onDelete: () => _confirmDelete(e),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: '新建日程',
        onPressed: _openCreate,
        child: const Icon(Icons.add),
      ),
    );
  }
}
```

- [ ] **Step 2: 改路由**

`apps/mobile/lib/router.dart`：

```dart
// 原行：GoRoute(path: '/event', builder: (context, state) => const PlaceholderPage(title: '日历', icon: Icons.calendar_today_outlined)),
// 改为：
GoRoute(path: '/event', builder: (context, state) => const EventPage()),
```

新增 import：`import 'features/event/event_page.dart';`

- [ ] **Step 3: 改 AppShell 徽标**

`apps/mobile/lib/app_shell.dart`：

```dart
// 1) 新增 import：
import 'features/event/event_providers.dart';

// 2) build 内（counts/auditUnread/taskTodo 之后）新增：
final eventToday = ref.watch(eventTodayCountProvider);

// 3) badgeFor 里把占位行：
//      '/event' => '2',
//    改为：
      '/event' => eventToday.hasValue && eventToday.value! > 0
          ? '${eventToday.value}'
          : null,

// 4) 打开抽屉时刷新计数（menu onPressed 里 countsProvider/taskTodoCountProvider 之后）新增：
      ref.invalidate(eventTodayCountProvider);
```

- [ ] **Step 4: 写页面 widget 测试**

`apps/mobile/test/features/event/event_page_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_page.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

/// 按 dayKey 生成当日 09:00 的事件（标题带 dayKey，便于断言导航切换）。
EventEntry dayEvent(String day) => EventEntry(
      id: 'e-$day',
      title: '$day 的事件',
      startAt: withOffset(DateTime(2026, 8, 12, 9, 0)),
      endAt: withOffset(DateTime(2026, 8, 12, 10, 0)),
      isAllDay: false,
      createdAt: 't',
      updatedAt: 't',
    );

void main() {
  ProviderContainer container({List<EventEntry> events = const []}) => ProviderContainer(
        overrides: [
          eventsForDayProvider.overrideWith((ref, day) async => events),
          eventsInMonthProvider.overrideWith((ref, month) async => const []),
          eventActionsProvider.overrideWith((ref) => EventActions(ref)),
        ],
      );

  Widget host(ProviderContainer c) => UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: EventPage()),
      );

  testWidgets('默认今天：渲染当日事件列表', (tester) async {
    final events = [dayEvent(todayKey())];
    final c = container(events: events);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    expect(find.text('${todayKey()} 的事件'), findsOneWidget);
    expect(find.text('09:00 – 10:00'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('空态：显示「这天没有日程」', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    expect(find.text('这天没有日程'), findsOneWidget);
  });

  testWidgets('日期导航 ▶ 切到明天：列表内容跟随', (tester) async {
    final c = container(events: [dayEvent(todayKey()), dayEvent(shiftDay(todayKey(), 1))]);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    // 当天显示今天的标题
    expect(find.text('${todayKey()} 的事件'), findsOneWidget);

    await tester.tap(find.byTooltip('后一天'));
    await tester.pumpAndSettle();

    expect(find.text('${shiftDay(todayKey(), 1)} 的事件'), findsOneWidget);
    expect(find.text('${todayKey()} 的事件'), findsNothing);
  });

  testWidgets('点日期文字：弹月历并跳到所选日期', (tester) async {
    final c = container(events: [dayEvent('2026-08-15')]);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.text(dateLabel(todayKey())));
    await tester.pumpAndSettle();
    expect(find.textContaining('年'), findsWidgets); // 月历标题

    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    // 月历 pop 后页面选中 8/15，列表显示该日事件
    expect(find.text('2026-08-15 的事件'), findsOneWidget);
  });

  testWidgets('FAB 打开新建弹窗（预填当前选中日）', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('新建日程'));
    await tester.pumpAndSettle();
    expect(find.text('新建日程'), findsOneWidget); // 弹窗标题
  });

  testWidgets('⋯ 删除：确认后调用 actions.delete', (tester) async {
    final events = [dayEvent('2026-08-12')];
    final c = container(events: events);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();

    // 确认对话框
    expect(find.textContaining('删除后不可恢复'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();

    // eventActionsProvider 是真实 EventActions：_api 走未 override 的 eventApiProvider
    // （测试环境 fail-fast，delete 抛错 → SnackBar）。这里只断言确认流程走完不崩。
    expect(find.byType(SnackBar), findsWidgets);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
```

> 注意：最后一个用例里 `eventActionsProvider` 是真实 `EventActions`，delete 会打到未 override 的 `eventApiProvider` → 测试环境 mock http 立即失败 → 页面 catch 后弹 SnackBar。断言 SnackBar 存在即证明「确认 → delete → 错误兜底」整条链路走通。若想更精确断言 delete 被调用，可像 Task 5 那样 override 一个 `_RecordingActions`，把最后两个用例（FAB 新建 + 删除）都换成记录版。

- [ ] **Step 5: 更新 router 测试**

`apps/mobile/test/router_test.dart` 末尾追加（照 `/audit` 用例模式）：

```dart
  testWidgets('已登录：/event 渲染真实日程页（非占位）', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
      eventsForDayProvider.overrideWith((ref, day) async => const []),
      eventsInMonthProvider.overrideWith((ref, month) async => const []),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();

    container.read(appRouterProvider).go('/event');
    await tester.pumpAndSettle();

    // 空态文案证明是真实日程页（占位页只会显示「功能开发中」）
    expect(find.byType(EventPage), findsOneWidget);
    expect(find.text('这天没有日程'), findsOneWidget);
  });
```

配套在 router_test.dart 头部新增 import：

```dart
import 'package:serenique_mobile/features/event/event_page.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
```

- [ ] **Step 6: 全量验证**

```bash
cd apps/mobile
flutter analyze
flutter test
```

期望：全部 PASS（含既有测试）。`app_shell_test.dart` 的 `shellRouter()` 不含 `/event` 路由，且其既有用例 watch 未 override 的 `taskTodoCountProvider` 已证明「未 override 的计数 provider 在测试里 fail-fast 不炸」——`eventTodayCountProvider` 同理，无需改动。`router_test.dart` 既有 8 个用例不导航到 `/event`，也不会受影响。

- [ ] **Step 7: 提交**

```bash
git add apps/mobile/lib/features/event/ apps/mobile/lib/router.dart apps/mobile/lib/app_shell.dart apps/mobile/test/features/event/ apps/mobile/test/router_test.dart
git commit -m "feat(mobile): wire up event page with routing and badge"
```

---

### Task 8: 收尾（worklog + 归档 plan）

**Files:**
- Create: `.ai/worklog/2026-08-10-flutter-event-module.md`
- Modify: 本 plan 文件（git mv 到 `.ai/archive/`）

- [ ] **Step 1: 写 worklog**

`.ai/worklog/2026-08-10-flutter-event-module.md`：按既有 worklog 格式（做了什么 / 验证 / 坑 / 对下一次会话的提示），记录：

- 实现 `features/event/` 全模块（单日列表 + 自绘月历弹窗 + 编辑 sheet + FAB），交互对齐 Web。
- 核心坑：**Dart `DateTime.parse(带偏移ISO)` 归一化 UTC，展示前必须 `.toLocal()`**（已实测 `2026-08-05T10:00:00+08:00` → `2026-08-05 02:00:00Z`）。
- **顺带修掉的潜在 bug**：`ApiClient._guard` 对 204 空 body 抛 `BAD_RESPONSE`——moment/task/blob/event 所有 `deleteData` 都受影响（之前一直没人暴露）。已加 `if (res.statusCode == 204) return null;`。
- `eventDayKeysInMonth` 重叠判定对齐后端：日 D 覆盖 ⇔ `start < D+1 00:00 && end > D 00:00`；事件结束在当日 00:00 不标记该日。
- provider 用 `ref.invalidate(family)` 整体失效（对齐 Web `invalidateQueries(['events'])`）；个人稀疏数据量下够用。
- 真机手测清单：iOS 模拟器/真机连生产：新建/编辑/删除、全天切换、跨日事件圆点与标签、月历切月/今天、抽屉徽标数字、下拉刷新。

- [ ] **Step 2: 提交 + 归档 plan**

```bash
git add .ai/worklog/2026-08-10-flutter-event-module.md
git commit -m "docs: record flutter event module implementation"

git mv docs/superpowers/plans/2026-08-10-flutter-event-module.md .ai/archive/2026-08-10-flutter-event-module-plan.md
git commit -m "docs: archive flutter event module implementation plan"
```

---

## Self-Review 记录

- **Spec 覆盖**：单日列表对齐 Web（Task 7 页面 + Task 6 日期导航）、自绘月历弹窗带圆点（Task 6）、编辑弹窗全字段含全天切换/校验（Task 5）、裸数组 API 与 `withOffset` 时区语义（Task 2-3）、整体失效 actions（Task 4）、抽屉徽标接真实计数（Task 7 Step 3）、204 删除前置修复（Task 1）。后端零改动 ✔。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整实现。唯一「按测试结果调整」的说明在 Task 4 Step 2 的 `_invalidateAll`（附了失败时的替代方案），不是占位。
- **类型一致性**：`EventEntry`/`event_time.dart` 全部函数签名在 Task 2 定义、Task 3-7 引用一致；`withOffset`/`dayWindow`/`monthWindow`/`eventTimeLabel`/`sortEvents`/`eventDayKeysInMonth`/`dayKey`/`monthKey`/`dayFromKey`/`todayKey`/`shiftDay`/`hhmm`/`md`/`dateLabel` 贯穿全程；`showEventEditSheet(BuildContext, {String? day, EventEntry? event})` 在 Task 5 定义、Task 7 调用一致；`EventTile({event, onEdit, onDelete})` 一致；`EventDateNav({selectedDay, onChanged, onPickDate})` 一致；`showMonthCalendarSheet(context, {initialDay})` 返回 `String?` 在 Task 6/7 一致。
- **Riverpod 3 事实核对**：`ref.invalidate(family)` 整体失效、`AsyncValue.valueOrNull`、`overrideWithValue`/`overrideWith` 均为 Riverpod 3 API；Task 4 的 provider 测试会实证 `ref.invalidate(family)` 行为，若不符有替代方案。
- **测试隔离**：所有 widget 测试都 override 了会触网的 provider（`eventsForDayProvider`/`eventsInMonthProvider`/`eventActionsProvider`）；`router_test` 既有用例无需改动（不导航 /event）；`app_shell_test` 无需改动（`shellRouter` 无 /event 路由，且 fail-fast 先例成立）。
