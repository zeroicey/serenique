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
