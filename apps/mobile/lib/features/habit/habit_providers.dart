// 习惯（Habit）模块 Riverpod providers。
// 数据流：API → FutureProvider（habits / dailyForDay / overview）；写操作集中在
// HabitActions，成功后 invalidate 相关 family 触发刷新（对齐 Web invalidateQueries）。
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'habit_api.dart';
import 'habit_models.dart';
import 'habit_time.dart';

final habitApiProvider = Provider<HabitApi>(
  (ref) => HabitApi(ref.watch(apiClientProvider)),
);

/// 习惯选项列表。
final habitsProvider = FutureProvider<List<Habit>>(
  (ref) => ref.watch(habitApiProvider).list(),
);

/// 某天全部状态（family 按 YYYY-MM-DD 缓存）。
final habitDailyForDayProvider =
    FutureProvider.family<List<HabitDaily>, String>(
      (ref, day) => ref.watch(habitApiProvider).listDaily(day),
    );

/// 总览（family 按天数缓存）。
final habitOverviewProvider = FutureProvider.family<HabitOverview, int>(
  (ref, days) => ref.watch(habitApiProvider).overview(days),
);

/// 选中日期 UI 状态：AppBar 日期导航与 HabitPage 列表共享。
/// 默认今天；只在 /habit 相关 widget watch。
class HabitUiController extends Notifier<String> {
  @override
  String build() => habitTodayKey();

  void select(String day) => state = day;
}

final habitSelectedDayProvider = NotifierProvider<HabitUiController, String>(
  HabitUiController.new,
);

/// 写操作集中处：成功后整体失效 habits / daily / overview。
class HabitActions {
  HabitActions(this._ref);

  final Ref _ref;
  HabitApi get _api => _ref.read(habitApiProvider);

  Future<Habit> create({
    required String name,
    required String kind,
    bool countable = false,
    String? description,
  }) async {
    final h = await _api.create(
      name: name,
      kind: kind,
      countable: countable,
      description: description,
    );
    _invalidateAll();
    return h;
  }

  Future<Habit> update(
    String id, {
    String? name,
    String? kind,
    bool? countable,
    int? sortOrder,
    String? description,
  }) async {
    final h = await _api.update(
      id,
      name: name,
      kind: kind,
      countable: countable,
      sortOrder: sortOrder,
      description: description,
    );
    _invalidateAll();
    return h;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _invalidateAll();
  }

  /// 标记做没做型：status = 'done' / 'not_done'。
  Future<void> setStatus({
    required String habitId,
    required String date,
    required String status,
  }) async {
    await _api.setDaily(habitId: habitId, date: date, status: status);
    _invalidateDaily(date);
  }

  /// 计数型：设置次数（≥0）。
  Future<void> setCount({
    required String habitId,
    required String date,
    required int count,
  }) async {
    await _api.setDaily(habitId: habitId, date: date, count: count);
    _invalidateDaily(date);
  }

  /// 回未记录（清除当天该习惯的每日状态）。
  Future<void> clearDaily({
    required String habitId,
    required String date,
  }) async {
    await _api.clearDaily(habitId: habitId, date: date);
    _invalidateDaily(date);
  }

  void _invalidateDaily(String date) {
    _ref.invalidate(habitDailyForDayProvider(date));
    _ref.invalidate(habitOverviewProvider);
  }

  void _invalidateAll() {
    _ref.invalidate(habitsProvider);
    _ref.invalidate(habitDailyForDayProvider);
    _ref.invalidate(habitOverviewProvider);
  }
}

final habitActionsProvider = Provider<HabitActions>((ref) => HabitActions(ref));
