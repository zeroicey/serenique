import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../location/location_format.dart';
import '../location/location_providers.dart';
import '../location/widgets/location_picker_sheet.dart';
import '../tag/widgets/tag_picker.dart';
import 'moment_draft_storage.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/attachment_picker_sheet.dart';
import 'widgets/local_attachment_grid.dart';

/// 新建闪记 —— 微信发布纯文本朋友圈的样式：返回键在左上，发表按钮在右上，正文无边框。
/// 支持附件：本地网格继续添加/删除，发表时逐个上传再创建闪记。
/// 支持位置：底部「所在位置」行（后端 config enabled 时显示）→ 选点 sheet。
/// 草稿：正文实时（300ms 防抖）持久化到本地，进入页面自动恢复，发布成功/删空清除；
/// 返回保留草稿（防误触丢失，重进恢复）。
class MomentCreatePage extends ConsumerStatefulWidget {
  const MomentCreatePage({super.key});

  @override
  ConsumerState<MomentCreatePage> createState() => _MomentCreatePageState();
}

class _MomentCreatePageState extends ConsumerState<MomentCreatePage> {
  final _controller = TextEditingController();
  Timer? _saveTimer;
  bool _submitting = false;
  // 发布成功后置 true：dispose 不再把正文写回草稿（草稿已在 _submit 里删除）
  bool _published = false;
  MomentLocation? _location;
  // 已选标签（只选已有；点开底部选择器多选，chips 可移除）。
  List<MomentTag> _selectedTags = const [];
  // dispose() 里不允许用 ref：草稿存储引用在 initState 缓存到字段
  late final MomentDraftStorage _draftStorage;
  List<PickedAttachment> get _picked => ref.read(pickedAttachmentsProvider);

  @override
  void initState() {
    super.initState();
    _draftStorage = ref.read(momentDraftStorageProvider);
    _restoreDraft();
    // 正文变化 → 防抖保存草稿（空串清除，等价无草稿）
    _controller.addListener(_onTextChanged);
  }

  Future<void> _restoreDraft() async {
    final saved = await _draftStorage.read();
    if (!mounted || saved == null || saved.isEmpty) return;
    // 恢复时机在首帧后：跳过一次正在编辑的旧快照，避免覆盖用户输入
    _controller.text = saved;
    _controller.selection = TextSelection.collapsed(offset: saved.length);
  }

  void _onTextChanged() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 300), _saveDraft);
  }

  Future<void> _saveDraft() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      await _draftStorage.delete();
    } else {
      await _draftStorage.write(text);
    }
  }

  /// 发布成功后删除已保存的草稿（页面即将 pop，无需再保存）。
  Future<void> _clearSavedDraft() async {
    _saveTimer?.cancel();
    _saveTimer = null;
    await _draftStorage.delete();
  }

  @override
  void dispose() {
    // 防抖窗口内的最后一次输入也要落盘（fire-and-forget，不阻塞销毁）；
    // 已发布则跳过——正文已提交，草稿已被删除，不能写回
    _saveTimer?.cancel();
    _saveTimer = null;
    if (!_published) {
      _saveDraft();
    }
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

  Future<void> _pickTags() async {
    final picked = await showTagPicker(
      context,
      initialTagIds: _selectedTags.map((t) => t.id).toList(),
    );
    if (picked == null || !mounted) return;
    setState(() => _selectedTags = picked);
  }

  void _removeTag(MomentTag tag) {
    setState(
      () => _selectedTags = _selectedTags.where((t) => t.id != tag.id).toList(),
    );
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final files = _picked
          .map(
            (a) => (bytes: a.bytes, filename: a.filename, mimeType: a.mimeType),
          )
          .toList();
      final location = _location;
      final tags = _selectedTags.map((t) => t.id).toList();
      if (files.isEmpty) {
        await ref
            .read(momentActionsProvider)
            .create(text, location: location, tags: tags);
      } else {
        await ref
            .read(momentActionsProvider)
            .createWithMedia(text, files, location: location, tags: tags);
      }
      ref.read(pickedAttachmentsProvider.notifier).clear();
      await _clearSavedDraft();
      _published = true;
      if (mounted) context.pop();
    } on Exception catch (e) {
      // 失败保留已选附件与正文，可重试。
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final picked = ref.watch(pickedAttachmentsProvider);
    // 后端位置代理未启用时不显示「所在位置」入口（FutureProvider 缓存，先查再渲染）。
    final locationEnabled = ref.watch(locationConfigProvider).value ?? false;
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
                child: Row(
                  children: [
                    Icon(
                      Icons.location_on_outlined,
                      size: 18,
                      color: scheme.onSurfaceVariant,
                    ),
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
                  ],
                ),
              ),
            ),
          ],
          // 打标签行：只选已有标签。点开 → 底部多选选择器；已选以 chips 展示（可移除）。
          const SizedBox(height: 12),
          const Divider(height: 1),
          InkWell(
            onTap: _pickTags,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Icon(
                    Icons.sell_outlined,
                    size: 18,
                    color: scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _selectedTags.isEmpty
                          ? '打标签'
                          : '已选 ${_selectedTags.length} 个标签',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        color: _selectedTags.isEmpty
                            ? scheme.onSurfaceVariant
                            : scheme.onSurface,
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 18, color: scheme.outline),
                ],
              ),
            ),
          ),
          // 已选标签 chips（可单个移除）。
          if (_selectedTags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final tag in _selectedTags)
                    Chip(
                      label: Text('#${tag.name}'),
                      onDeleted: () => _removeTag(tag),
                      deleteIcon: const Icon(Icons.close, size: 16),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
