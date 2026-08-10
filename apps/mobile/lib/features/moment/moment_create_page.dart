import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../location/location_format.dart';
import '../location/location_providers.dart';
import '../location/widgets/location_picker_sheet.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/attachment_picker_sheet.dart';
import 'widgets/local_attachment_grid.dart';

/// 新建闪记 —— 微信发布纯文本朋友圈的样式：返回键在左上，发表按钮在右上，正文无边框。
/// 支持附件：本地网格继续添加/删除，发表时逐个上传再创建闪记。
/// 支持位置：底部「所在位置」行（后端 config enabled 时显示）→ 选点 sheet。
class MomentCreatePage extends ConsumerStatefulWidget {
  const MomentCreatePage({super.key});

  @override
  ConsumerState<MomentCreatePage> createState() => _MomentCreatePageState();
}

class _MomentCreatePageState extends ConsumerState<MomentCreatePage> {
  final _controller = TextEditingController();
  bool _submitting = false;
  MomentLocation? _location;
  List<PickedAttachment> get _picked => ref.read(pickedAttachmentsProvider);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _addMore() async {
    final picked = await showAttachmentPickerSheet(context);
    if (picked == null || !mounted) return;
    ref.read(pickedAttachmentsProvider.notifier).addAll(picked);
    setState(() {});
  }

  Future<void> _pickLocation() async {
    final picked = await showLocationPickerSheet(context);
    if (picked == null || !mounted) return;
    setState(() => _location = picked);
  }

  void _clearLocation() => setState(() => _location = null);

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final files = _picked
          .map((a) => (bytes: a.bytes, filename: a.filename, mimeType: a.mimeType))
          .toList();
      final location = _location;
      if (files.isEmpty) {
        await ref.read(momentActionsProvider).create(text, location: location);
      } else {
        await ref
            .read(momentActionsProvider)
            .createWithMedia(text, files, location: location);
      }
      ref.read(pickedAttachmentsProvider.notifier).clear();
      if (mounted) context.pop();
    } on Exception catch (e) {
      // 失败保留已选附件与正文，可重试。
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final picked = ref.watch(pickedAttachmentsProvider);
    // 后端位置代理未启用时不显示「所在位置」入口（FutureProvider 缓存，先查再渲染）。
    final locationEnabled =
        ref.watch(locationConfigProvider).value ?? false;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('新建闪记'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('发表'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _controller,
            maxLength: 10000,
            minLines: 3,
            maxLines: null,
            textAlignVertical: TextAlignVertical.top,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: '记录此刻的想法…',
              border: InputBorder.none,
              counterText: '',
            ),
          ),
          if (picked.isNotEmpty) ...[
            const SizedBox(height: 12),
            LocalAttachmentGrid(
              attachments: picked,
              onRemove: (i) {
                ref.read(pickedAttachmentsProvider.notifier).removeAt(i);
              },
              onAdd: _addMore,
            ),
          ],
          if (picked.isEmpty) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _addMore,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('添加图片 / 视频 / 音频'),
            ),
          ],
          if (locationEnabled) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            // 「所在位置」行：默认「不显示位置」（灰色）；选中后显示名称 + × 清除。
            InkWell(
              onTap: _pickLocation,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(children: [
                  Icon(Icons.location_on_outlined,
                      size: 18, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _location == null
                          ? '不显示位置'
                          : '📍 ${locationLabel(_location!)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        color: _location == null
                            ? scheme.onSurfaceVariant
                            : scheme.onSurface,
                      ),
                    ),
                  ),
                  if (_location == null)
                    Icon(Icons.chevron_right, size: 18, color: scheme.outline)
                  else
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      tooltip: '清除位置',
                      onPressed: _clearLocation,
                    ),
                ]),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
