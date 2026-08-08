import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/attachment_picker_sheet.dart';
import 'widgets/local_attachment_grid.dart';

/// 新建闪记 —— 微信发布纯文本朋友圈的样式：返回键在左上，发表按钮在右上，正文无边框。
/// 支持附件：本地网格继续添加/删除，发表时逐个上传再创建闪记。
class MomentCreatePage extends ConsumerStatefulWidget {
  const MomentCreatePage({super.key});

  @override
  ConsumerState<MomentCreatePage> createState() => _MomentCreatePageState();
}

class _MomentCreatePageState extends ConsumerState<MomentCreatePage> {
  final _controller = TextEditingController();
  bool _submitting = false;
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
      if (files.isEmpty) {
        await ref.read(momentActionsProvider).create(text);
      } else {
        await ref.read(momentActionsProvider).createWithMedia(text, files);
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
        ],
      ),
    );
  }
}
