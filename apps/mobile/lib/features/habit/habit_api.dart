// 习惯（Habit）模块 HTTP 封装。路由契约见
// .ai/requirements/2026-08-16-habit-module.md 第 4 节。
import '../../../core/network/api_client.dart';
import 'habit_models.dart';

class HabitApi {
  HabitApi(this._client);

  final ApiClient _client;

  /// 习惯选项列表（服务端按 sortOrder asc, createdAt asc 排好）。
  Future<List<Habit>> list() async {
    final data = await _client.getData('/api/habits');
    return (data as List<dynamic>)
        .map((e) => Habit.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Habit> create({
    required String name,
    required String kind,
    bool countable = false,
  }) async {
    final data = await _client.postData(
      '/api/habits',
      body: {'name': name, 'kind': kind, 'countable': countable},
    );
    return Habit.fromJson(data as Map<String, dynamic>);
  }

  /// 部分更新：只传非空字段（服务端 refine 至少一个字段）。
  Future<Habit> update(
    String id, {
    String? name,
    String? kind,
    bool? countable,
    int? sortOrder,
  }) async {
    final data = await _client.putData(
      '/api/habits/$id',
      body: {
        'name': ?name,
        'kind': ?kind,
        'countable': ?countable,
        'sortOrder': ?sortOrder,
      },
    );
    return Habit.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) => _client.deleteData('/api/habits/$id');

  /// 某天全部状态 `[{ habitId, status, count, note }]`。
  Future<List<HabitDaily>> listDaily(String date) async {
    final data = await _client.getData(
      '/api/habit-daily',
      query: {'date': date},
    );
    return (data as List<dynamic>)
        .map((e) => HabitDaily.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// upsert 每日状态：做没做型传 [status]（'done'/'not_done'），计数型传 [count]。
  /// [note] 非空时一并写入（服务端支持仅 note 的 upsert）。
  Future<void> setDaily({
    required String habitId,
    required String date,
    String? status,
    int? count,
    String? note,
  }) async {
    await _client.putData(
      '/api/habits/$habitId/daily/$date',
      body: {'status': ?status, 'count': ?count, 'note': ?note},
    );
  }

  /// 保存/清除备注：传 null 即清除（body 里显式 note: null）。
  Future<void> setNote({
    required String habitId,
    required String date,
    required String? note,
  }) async {
    await _client.putData(
      '/api/habits/$habitId/daily/$date',
      body: {'note': note},
    );
  }

  /// 清掉当天该习惯的记录（回未记录）。
  Future<void> clearDaily({
    required String habitId,
    required String date,
  }) async {
    await _client.deleteData('/api/habits/$habitId/daily/$date');
  }

  /// 总览：按天分组流水 + 每习惯频率统计。
  Future<HabitOverview> overview(int days) async {
    final data = await _client.getData(
      '/api/habit-daily/overview',
      query: {'days': days},
    );
    return HabitOverview.fromJson(data as Map<String, dynamic>);
  }
}
