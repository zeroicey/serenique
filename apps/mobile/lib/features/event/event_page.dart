// 日程主页面：当日事件列表（日期导航与「新建」按钮在 AppShell AppBar）。
// 选中日来自 eventSelectedDayProvider，删除确认保留。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'event_models.dart';
import 'event_providers.dart';
import 'event_time.dart';
import 'widgets/event_edit_page.dart';
import 'widgets/event_tile.dart';

class EventPage extends ConsumerWidget {
  const EventPage({super.key});

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, EventEntry e) async {
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
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(eventActionsProvider).delete(e.id);
    } catch (err) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(humanizeError(err))));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDay = ref.watch(eventSelectedDayProvider);
    final events = ref.watch(eventsForDayProvider(selectedDay));
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(eventsForDayProvider(selectedDay).future),
        child: events.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(
            error: err,
            onRetry: () => ref.invalidate(eventsForDayProvider(selectedDay)),
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
                  onEdit: () =>
                      context.push('/event/edit', extra: EventEditArgs(event: e)),
                  onDelete: () => _confirmDelete(context, ref, e),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
