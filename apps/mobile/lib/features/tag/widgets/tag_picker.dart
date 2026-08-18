import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../moment/moment_models.dart';
import '../tag_providers.dart';

/// 弹出底部标签选择器，返回选中的标签列表（只选已有，不做即输即建）。
/// 取消/点遮罩关闭 → null；确定 → 选中的 [MomentTag]。
Future<List<MomentTag>?> showTagPicker(
  BuildContext context, {
  List<String> initialTagIds = const [],
}) {
  return showModalBottomSheet<List<MomentTag>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => TagPickerSheet(initialTagIds: initialTagIds),
  );
}

/// 标签多选 sheet：搜索过滤（只选已有）+ 已选 chips + 确定。
/// 数据来自 tagsProvider（写操作后自动刷新）；本地 _selected 为选中态，确定时返回。
class TagPickerSheet extends ConsumerStatefulWidget {
  const TagPickerSheet({super.key, this.initialTagIds = const []});

  final List<String> initialTagIds;

  @override
  ConsumerState<TagPickerSheet> createState() => _TagPickerSheetState();
}

class _TagPickerSheetState extends ConsumerState<TagPickerSheet> {
  late final Set<String> _selected = widget.initialTagIds.toSet();
  final _queryController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  void _toggle(MomentTag tag) {
    setState(() {
      if (!_selected.add(tag.id)) _selected.remove(tag.id);
    });
  }

  void _submit() {
    final tagsAsync = ref.read(tagsProvider);
    final all = tagsAsync.value ?? const <MomentTag>[];
    final chosen = all.where((t) => _selected.contains(t.id)).toList();
    Navigator.of(context).pop(chosen);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tagsAsync = ref.watch(tagsProvider);
    final all = tagsAsync.value ?? const <MomentTag>[];
    final filtered = _query.trim().isEmpty
        ? all
        : all
              .where(
                (t) =>
                    t.name.toLowerCase().contains(_query.trim().toLowerCase()),
              )
              .toList();

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '选择标签',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: '关闭',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _queryController,
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: '搜索标签',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                filled: true,
                fillColor: scheme.surfaceContainerHighest,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          // 已选 chips（可移除）
          if (_selected.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final t in all.where((t) => _selected.contains(t.id)))
                    Chip(
                      label: Text(t.name),
                      onDeleted: () => _toggle(t),
                      deleteIcon: const Icon(Icons.close, size: 16),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ),
          // 列表（撑起半屏高度）
          Flexible(
            child: tagsAsync.when(
              loading: () => const SizedBox(
                height: 180,
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (err, _) => const SizedBox(
                height: 180,
                child: Center(child: Text('加载标签失败')),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return const SizedBox(
                    height: 160,
                    child: Center(child: Text('还没有标签，去标签页创建后再选择')),
                  );
                }
                if (filtered.isEmpty) {
                  return const SizedBox(
                    height: 160,
                    child: Center(child: Text('未找到匹配的标签')),
                  );
                }
                return ListView(
                  shrinkWrap: true,
                  children: [
                    for (final t in filtered)
                      CheckboxListTile(
                        value: _selected.contains(t.id),
                        onChanged: (_) => _toggle(t),
                        controlAffinity: ListTileControlAffinity.leading,
                        title: Text(t.name),
                        subtitle: Text('${t.momentCount} 条闪记'),
                        dense: true,
                      ),
                  ],
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton(
              onPressed: _submit,
              child: Text(_selected.isEmpty ? '确定' : '确定（${_selected.length}）'),
            ),
          ),
        ],
      ),
    );
  }
}
