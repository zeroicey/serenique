import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'moment_providers.dart';
import 'widgets/comment_section.dart';

class MomentDetailPage extends ConsumerWidget {
  const MomentDetailPage({super.key, required this.id});

  final String id;

  Future<void> _delete(BuildContext context, WidgetRef ref, String momentId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这条闪记？'),
        content: const Text('删除后不可恢复。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(momentActionsProvider).delete(momentId);
      if (context.mounted) context.pop();
    } on Exception catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(momentDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('闪记详情')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(
            error: err, onRetry: () => ref.invalidate(momentDetailProvider(id))),
        data: (moment) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(moment.text, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(moment.createdAt, style: Theme.of(context).textTheme.bodySmall),
            const Divider(height: 32),
            CommentSection(momentId: moment.id),
            const SizedBox(height: 88),
          ],
        ),
      ),
      floatingActionButton: detail.hasValue
          ? FloatingActionButton(
              tooltip: '删除',
              onPressed: () => _delete(context, ref, detail.value!.id),
              child: const Icon(Icons.delete_outline),
            )
          : null,
    );
  }
}
