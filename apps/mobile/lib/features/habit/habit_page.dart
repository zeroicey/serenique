// 习惯主页面：今天做了什么（日期导航在 AppShell AppBar；右上角「新建」「总览」在
// AppShell actions）。选中日来自 habitSelectedDayProvider，删除确认保留。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'habit_models.dart';
import 'habit_providers.dart';
import 'widgets/habit_edit_page.dart';
import 'widgets/habit_tile.dart';

class HabitPage extends ConsumerWidget {
  const HabitPage({super.key});

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Habit h,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除习惯'),
        content: Text('确定删除「${h.name}」吗？历史记录会一并删除，不可恢复。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(habitActionsProvider).delete(h.id);
    } catch (err) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(humanizeError(err))));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDay = ref.watch(habitSelectedDayProvider);
    final habits = ref.watch(habitsProvider);
    final daily = ref.watch(habitDailyForDayProvider(selectedDay));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(habitsProvider);
          ref.invalidate(habitDailyForDayProvider(selectedDay));
          await ref.read(habitsProvider.future);
          await ref.read(habitDailyForDayProvider(selectedDay).future);
        },
        child: habits.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(
            error: err,
            onRetry: () => ref.invalidate(habitsProvider),
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 120),
                  const Icon(Icons.repeat, size: 48, color: Colors.grey),
                  const SizedBox(height: 16),
                  const Center(child: Text('还没有习惯，点右上角 + 新建第一个吧')),
                ],
              );
            }
            final dailyMap = switch (daily) {
              AsyncData(value: final items) => {
                for (final d in items) d.habitId: d,
              },
              _ => <String, HabitDaily>{},
            };
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: list.length,
              separatorBuilder: (_, _) =>
                  const Divider(height: 1, indent: 16, endIndent: 16),
              itemBuilder: (context, index) {
                final h = list[index];
                return HabitTile(
                  habit: h,
                  daily: dailyMap[h.id],
                  date: selectedDay,
                  onEdit: () => context.push(
                    '/habit/edit',
                    extra: HabitEditArgs(habit: h),
                  ),
                  onDelete: () => _confirmDelete(context, ref, h),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
