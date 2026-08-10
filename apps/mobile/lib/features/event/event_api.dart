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
