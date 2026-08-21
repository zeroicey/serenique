import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../../blob/blob_models.dart';
import '../../blob/blob_providers.dart';

/// ownerType → 用户可读名。moment 附件同样写入 blob_attachments，其余模块经通用引用注册。
/// 未知 ownerType 原样显示。
String blobOwnerTypeLabel(String ownerType) => switch (ownerType) {
  'moment' => '闪记',
  'diary' => '日记',
  'event' => '日历事件',
  'task' => '任务',
  'habit' => '习惯',
  'ai' => '宁序对话',
  _ => ownerType,
};

/// 打开删除确认底部弹窗：先 invalidate 引用查询（打开时懒查），再弹 sheet。
Future<void> showBlobDeleteSheet(
  BuildContext context,
  WidgetRef ref,
  BlobEntry blob,
) async {
  ref.invalidate(blobAttachmentsProvider(blob.id));
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => BlobDeleteSheet(blob: blob),
  );
}

/// 删除确认底部弹窗：懒查该 blob 的业务引用。
/// 有引用 → 列引用方（中文 × 数量）+ 删除禁用 + 提示；无引用 → 红色确认删除。
/// 后端 409 兜底（竞态下删除仍会被拒绝）。
class BlobDeleteSheet extends ConsumerStatefulWidget {
  const BlobDeleteSheet({super.key, required this.blob});

  final BlobEntry blob;

  @override
  ConsumerState<BlobDeleteSheet> createState() => _BlobDeleteSheetState();
}

class _BlobDeleteSheetState extends ConsumerState<BlobDeleteSheet> {
  bool _deleting = false;

  BlobEntry get _blob => widget.blob;

  Future<void> _delete() async {
    setState(() => _deleting = true);
    try {
      await ref.read(blobActionsProvider).delete(_blob.id);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('文件已删除')));
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(humanizeError(e))));
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final attachments = ref.watch(blobAttachmentsProvider(_blob.id));

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('删除文件', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              _blob.originalName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            attachments.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (err, _) => Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.errorContainer.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '引用查询失败：${humanizeError(err)}',
                      style: TextStyle(fontSize: 13, color: scheme.onErrorContainer),
                    ),
                    TextButton(
                      onPressed: () =>
                          ref.invalidate(blobAttachmentsProvider(_blob.id)),
                      child: const Text('重试'),
                    ),
                  ],
                ),
              ),
              data: (refs) {
                final hasRefs = refs.isNotEmpty;
                if (hasRefs) {
                  // 按 ownerType 聚合计数
                  final byType = <String, int>{};
                  for (final r in refs) {
                    byType[r.ownerType] = (byType[r.ownerType] ?? 0) + 1;
                  }
                  return Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: scheme.errorContainer.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '该文件仍被 ${refs.length} 处内容引用，无法删除',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                color: scheme.onErrorContainer,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                for (final entry in byType.entries)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: scheme.surface,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '${blobOwnerTypeLabel(entry.key)} × ${entry.value}',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '请先在对应内容中移除该附件后再删除文件。',
                        style: TextStyle(fontSize: 12, color: scheme.outline),
                      ),
                    ],
                  );
                }
                return Text(
                  '该文件未被任何内容引用。删除后对象存储中的文件体将一并移除，不可恢复。',
                  style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                );
              },
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _deleting ? null : () => Navigator.of(context).pop(),
                    child: const Text('取消'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: scheme.error,
                      foregroundColor: scheme.onError,
                    ),
                    onPressed:
                        _deleting || _isReferenced ? null : _delete,
                    child: _deleting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('确认删除'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// 引用加载中/失败/有引用时禁删（引用查询失败也保守禁删，靠后端 409 兜底的可达路径
  /// 只在查询失败后用户无计可施时出现——此处保守优先保护已发布内容）。
  bool get _isReferenced {
    final value = ref.read(blobAttachmentsProvider(_blob.id)).value;
    return value == null || value.isNotEmpty;
  }
}