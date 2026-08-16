// 习惯（Habit）模块数据模型。
// 契约对齐 services/api/src/modules/habit/habit.types.ts：
// - HabitEntry: { id, name, description, kind('good'|'bad'), countable, sortOrder, createdAt, updatedAt }
// - DailyEntry: { habitId, status('done'|'not_done'|null), count } —— 没有 id/date/updatedAt
// - OverviewBody: { days, fromDate, toDate, byDate: {date: [记录+name/kind/countable]}, stats }
/// 习惯选项。
class Habit {
  const Habit({
    required this.id,
    required this.name,
    this.description,
    required this.kind,
    required this.countable,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Habit.fromJson(Map<String, dynamic> json) => Habit(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
    kind: json['kind'] as String,
    countable: json['countable'] as bool? ?? false,
    sortOrder: json['sortOrder'] as int? ?? 0,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String name;

  /// 习惯简介（可选，≤500 字符），列表行名称下方展示。
  final String? description;

  /// 'good'（好事）| 'bad'（坏事），只做视觉区分。
  final String kind;

  /// false = 做没做型（status 三态）；true = 计数型（count 次数）。
  final bool countable;
  final int sortOrder;
  final String createdAt;
  final String updatedAt;

  bool get isGood => kind == 'good';
}

/// 某天某习惯的每日状态（做没做型 status + 计数型 count 二选一）。
class HabitDaily {
  const HabitDaily({
    required this.habitId,
    required this.status,
    required this.count,
  });

  factory HabitDaily.fromJson(Map<String, dynamic> json) => HabitDaily(
    habitId: json['habitId'] as String,
    status: json['status'] as String?,
    count: json['count'] as int? ?? 0,
  );

  final String habitId;

  /// 'done' | 'not_done'；null = 未记录。计数型恒 null。
  final String? status;

  /// 计数型次数（≥0）；做没做型恒 0。
  final int count;

  bool get isDone => status == 'done';
  bool get isNotDone => status == 'not_done';
}

/// 总览 byDate 单条记录：每日状态 + 内联习惯名/kind（name 字段，非 habitName）。
class HabitOverviewRecord {
  const HabitOverviewRecord({
    required this.habitId,
    required this.name,
    required this.kind,
    required this.countable,
    required this.status,
    required this.count,
  });

  factory HabitOverviewRecord.fromJson(Map<String, dynamic> json) =>
      HabitOverviewRecord(
        habitId: json['habitId'] as String,
        name: json['name'] as String,
        kind: json['kind'] as String,
        countable: json['countable'] as bool? ?? false,
        status: json['status'] as String?,
        count: json['count'] as int? ?? 0,
      );

  final String habitId;
  final String name;
  final String kind;
  final bool countable;
  final String? status;
  final int count;
}

/// 总览单习惯统计。
class HabitStat {
  const HabitStat({
    required this.habitId,
    required this.name,
    required this.kind,
    required this.countable,
    required this.doneDays,
    required this.notDoneDays,
    required this.totalCount,
  });

  factory HabitStat.fromJson(Map<String, dynamic> json) => HabitStat(
    habitId: json['habitId'] as String,
    name: json['name'] as String,
    kind: json['kind'] as String,
    countable: json['countable'] as bool? ?? false,
    doneDays: json['doneDays'] as int? ?? 0,
    notDoneDays: json['notDoneDays'] as int? ?? 0,
    totalCount: json['totalCount'] as int? ?? 0,
  );

  final String habitId;
  final String name;
  final String kind;
  final bool countable;

  /// 做没做型：统计期内标记「做了」的天数。
  final int doneDays;

  /// 做没做型：统计期内标记「没做」的天数。
  final int notDoneDays;

  /// 计数型：统计期内总次数。
  final int totalCount;
}

/// 总览响应体。
class HabitOverview {
  const HabitOverview({
    required this.days,
    required this.fromDate,
    required this.toDate,
    required this.byDate,
    required this.stats,
  });

  factory HabitOverview.fromJson(Map<String, dynamic> json) => HabitOverview(
    days: json['days'] as int? ?? 30,
    fromDate: json['fromDate'] as String,
    toDate: json['toDate'] as String,
    byDate: (json['byDate'] as Map<String, dynamic>).map(
      (date, list) => MapEntry(
        date,
        (list as List<dynamic>)
            .map((e) => HabitOverviewRecord.fromJson(e as Map<String, dynamic>))
            .toList(),
      ),
    ),
    stats: (json['stats'] as List<dynamic>? ?? [])
        .map((e) => HabitStat.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  final int days;
  final String fromDate;
  final String toDate;

  /// date(YYYY-MM-DD) → 当天记录（习惯名内联）。
  final Map<String, List<HabitOverviewRecord>> byDate;
  final List<HabitStat> stats;

  /// 按日期倒序的流水分组。
  List<MapEntry<String, List<HabitOverviewRecord>>> get dayListDescending {
    final entries = byDate.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));
    return entries;
  }
}
