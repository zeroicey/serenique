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
