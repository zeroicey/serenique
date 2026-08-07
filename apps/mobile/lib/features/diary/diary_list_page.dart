import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/widgets/async_view.dart';
import 'diary_providers.dart';

class DiaryListPage extends ConsumerWidget {
  const DiaryListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(diaryListProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/diary/${DateFormat('yyyy-MM-dd').format(DateTime.now())}'),
        tooltip: '写今天',
        child: const Icon(Icons.edit_outlined),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(diaryListProvider.future),
        child: entries.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) =>
              AsyncErrorView(error: err, onRetry: () => ref.invalidate(diaryListProvider)),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                  children: const [ListTile(title: Text('还没有日记，点右下角写一篇'))]);
            }
            final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
            return ListView.builder(
              itemCount: list.length,
              itemBuilder: (context, index) {
                final e = list[index];
                final isToday = e.diaryDate == today;
                return ListTile(
                  title: Text(e.diaryDate),
                  subtitle: Text(
                    e.content,
                    maxLines: isToday ? null : 2,
                    overflow:
                        isToday ? TextOverflow.visible : TextOverflow.ellipsis,
                  ),
                  onTap: () => context.push('/diary/${e.diaryDate}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
