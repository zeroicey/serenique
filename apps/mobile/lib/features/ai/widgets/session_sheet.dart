// 会话切换 bottom sheet：新建 / 切换 / 删除（删除需确认）。等价 Web 的 header 下拉。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';

Future<void> showSessionSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) {
      final sessions = ref.watch(aiControllerProvider.select((s) => s.sessions));
      final currentId = ref.watch(aiControllerProvider.select((s) => s.currentSessionId));
      final notifier = ref.read(aiControllerProvider.notifier);

      Future<void> confirmDelete(String id, String name) async {
        final ok = await showDialog<bool>(
          context: sheetContext,
          builder: (dctx) => AlertDialog(
            title: const Text('删除会话'),
            content: Text('删除会话「$name」？此操作不可恢复。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dctx, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dctx, true),
                child: const Text('删除'),
              ),
            ],
          ),
        );
        if (ok == true && sheetContext.mounted) Navigator.pop(sheetContext);
        if (ok == true) notifier.deleteSession(id);
      }

      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('新建会话'),
              onTap: () {
                Navigator.pop(sheetContext);
                notifier.newSession();
              },
            ),
            const Divider(height: 1),
            if (sessions.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('暂无会话', textAlign: TextAlign.center),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: sessions.length,
                  itemBuilder: (context, i) {
                    final s = sessions[i];
                    final selected = s.id == currentId;
                    return ListTile(
                      selected: selected,
                      selectedTileColor:
                          Theme.of(context).colorScheme.secondaryContainer.withValues(alpha: 0.4),
                      title: Text(s.name, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${s.messageCount} 条消息'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        tooltip: '删除会话',
                        onPressed: () => confirmDelete(s.id, s.name),
                      ),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        if (s.id != currentId) notifier.switchSession(s.id);
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      );
    },
  );
}
