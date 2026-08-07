import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'moment_providers.dart';
import 'widgets/moment_card.dart';

/// 闪记列表 —— 朋友圈风格的信息流。
/// 每条闪记显示纯文本（长文可展开）+ 时间 + 内嵌评论；点卡片进详情（评论/删除）。
class MomentListPage extends ConsumerWidget {
  const MomentListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moments = ref.watch(momentListProvider);
    return Scaffold(
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
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) =>
                  const Divider(height: 1, indent: 16, endIndent: 16),
              itemBuilder: (context, index) {
                final m = items[index];
                return InkWell(
                  onTap: () => context.push('/moments/${m.id}'),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: MomentCard(moment: m),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
