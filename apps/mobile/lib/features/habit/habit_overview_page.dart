// 习惯总览页：近 N 天频率统计 + 按天倒序流水。
// 由 /habit/overview 路由承载（ShellRoute 内，自持标题）。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/async_view.dart';
import 'habit_models.dart';
import 'habit_providers.dart';

const _kOverviewDays = 30;

class HabitOverviewPage extends ConsumerWidget {
  const HabitOverviewPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(habitOverviewProvider(_kOverviewDays));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(habitOverviewProvider(_kOverviewDays));
          await ref.read(habitOverviewProvider(_kOverviewDays).future);
        },
        child: overview.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(
            error: err,
            onRetry: () =>
                ref.invalidate(habitOverviewProvider(_kOverviewDays)),
          ),
          data: (data) {
            if (data.stats.isEmpty && data.byDate.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  Icon(Icons.insights, size: 48, color: Colors.grey),
                  SizedBox(height: 16),
                  Center(child: Text('还没有任何记录，先去「习惯」页记几笔吧')),
                ],
              );
            }
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(12),
              children: [
                if (data.stats.isNotEmpty) _StatsSection(overview: data),
                if (data.byDate.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _TimelineSection(overview: data),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// 频率统计区：每习惯一行（圆点 + 名称 + 进度条 + 统计文本）。
class _StatsSection extends StatelessWidget {
  const _StatsSection({required this.overview});

  final HabitOverview overview;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '近 ${overview.days} 天频率',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.grey,
              ),
            ),
            const SizedBox(height: 8),
            for (final stat in overview.stats)
              _StatRow(stat: stat, days: overview.days),
          ],
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.stat, required this.days});

  final HabitStat stat;
  final int days;

  @override
  Widget build(BuildContext context) {
    final color = stat.kind == 'good' ? Colors.green : Colors.redAccent;
    final ratio = stat.countable
        ? 0.0
        : days == 0
        ? 0.0
        : stat.doneDays / days;
    final label = stat.countable
        ? '共 ${stat.totalCount} 次'
        : '${stat.doneDays}/$days 天';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 72,
            child: Text(
              stat.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: stat.countable
                ? const SizedBox.shrink()
                : ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: ratio.clamp(0.0, 1.0),
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade200,
                      color: color,
                    ),
                  ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 64,
            child: Text(
              label,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }
}

/// 按天倒序流水区。
class _TimelineSection extends StatelessWidget {
  const _TimelineSection({required this.overview});

  final HabitOverview overview;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final entry in overview.dayListDescending)
          _DayGroup(date: entry.key, records: entry.value),
      ],
    );
  }
}

class _DayGroup extends StatelessWidget {
  const _DayGroup({required this.date, required this.records});

  final String date;
  final List<HabitOverviewRecord> records;

  String get _label {
    final p = date.split('-');
    final d = DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return '${p[1]}月${p[2]}日 ${weekdays[d.weekday - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.grey,
              ),
            ),
            const SizedBox(height: 4),
            for (final r in records) _RecordRow(record: r),
          ],
        ),
      ),
    );
  }
}

class _RecordRow extends StatelessWidget {
  const _RecordRow({required this.record});

  final HabitOverviewRecord record;

  @override
  Widget build(BuildContext context) {
    final color = record.kind == 'good' ? Colors.green : Colors.redAccent;
    final Widget mark;
    if (record.countable) {
      mark = Text(
        '×${record.count}',
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.grey,
        ),
      );
    } else if (record.status == 'done') {
      mark = const Icon(Icons.check_circle, size: 16, color: Colors.green);
    } else if (record.status == 'not_done') {
      mark = const Icon(Icons.cancel, size: 16, color: Colors.redAccent);
    } else {
      mark = const Icon(
        Icons.radio_button_unchecked,
        size: 16,
        color: Colors.grey,
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          mark,
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              record.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}
