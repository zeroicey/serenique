import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'moment_providers.dart';

class MomentListPage extends ConsumerWidget {
  const MomentListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moments = ref.watch(momentListProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/moments/create'),
        tooltip: '新建闪记',
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(momentListProvider.future),
        child: moments.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(
              error: err, onRetry: () => ref.invalidate(momentListProvider)),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                  children: const [ListTile(title: Text('还没有闪记，点右下角新建'))]);
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final m = items[index];
                return ListTile(
                  title: Text(m.text, maxLines: 2, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${m.commentCount} 条评论'),
                  onTap: () => context.push('/moments/${m.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
