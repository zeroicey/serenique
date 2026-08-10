// AppBar 会话切换标题（AppShell 对 /ai 渲染）：宁序 + 当前会话名（▾），点击弹会话列表。
import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';
import 'session_sheet.dart';

class AiSessionTitle extends ConsumerWidget {
  const AiSessionTitle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(aiControllerProvider.select((s) => s.sessions));
    final currentId = ref.watch(aiControllerProvider.select((s) => s.currentSessionId));
    final name = sessions.where((s) => s.id == currentId).map((s) => s.name).firstOrNull ?? '新会话';

    return InkWell(
      onTap: () => showSessionSheet(context, ref),
      borderRadius: BorderRadius.circular(8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('宁序'),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
          const Icon(Icons.arrow_drop_down, size: 20),
        ],
      ),
    );
  }
}
