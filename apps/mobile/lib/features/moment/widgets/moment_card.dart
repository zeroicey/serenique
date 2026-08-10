import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/api_exception.dart';
import '../../location/location_format.dart';
import '../media_preview.dart';
import '../moment_models.dart';
import '../moment_providers.dart';
import '../moment_time.dart';
import 'attachment_grid.dart';
import 'comment_row.dart';

/// 朋友圈样式的闪记卡片：纯文本（「全文/收起」在正文下方）+ 时间行（⋮ 菜单）+ 内嵌评论 + 内联评论输入。
/// 评论输入默认隐藏：点 ⋮ →「评论」才展开，发送成功后收起；删除也在 ⋮ 菜单里。
class MomentCard extends ConsumerStatefulWidget {
  const MomentCard({super.key, required this.moment});

  final Moment moment;

  @override
  ConsumerState<MomentCard> createState() => _MomentCardState();
}

class _MomentCardState extends ConsumerState<MomentCard> {
  static const _collapseLines = 8;

  bool _expanded = false;
  bool _showCommentInput = false;
  bool _submitting = false;
  bool _deleting = false;
  final _commentController = TextEditingController();
  final _commentFocus = FocusNode();

  Moment get _moment => widget.moment;

  @override
  void dispose() {
    _commentController.dispose();
    _commentFocus.dispose();
    super.dispose();
  }

  Future<void> _submitComment() async {
    final content = _commentController.text.trim();
    if (content.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(momentActionsProvider).addComment(_moment.id, content);
      _commentController.clear();
      // 发送成功：隐藏输入框（评论已出现在列表里）。
      setState(() => _showCommentInput = false);
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete() async {
    if (_deleting) return;
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
    if (ok != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(momentActionsProvider).delete(_moment.id);
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  /// 有坐标时打开高德深链（经度,纬度 顺序由 amapDeepLink 保证）。
  Future<void> _openLocation(MomentLocation location) async {
    final ok = await launchUrl(Uri.parse(amapDeepLink(location)),
        mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('无法打开地图')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final moment = _moment;
    final scheme = theme.colorScheme;

    return LayoutBuilder(
      builder: (context, constraints) {
        // 用 TextPainter 判断收起状态下是否真的会溢出，避免短文本也显示「全文」。
        final style = theme.textTheme.bodyLarge!;
        final painter = TextPainter(
          text: TextSpan(text: moment.text, style: style),
          maxLines: _collapseLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;

        // 网格与全屏预览共用同一有序列表，保证索引一致。
        final attachments = sortedAttachments(moment.attachments);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              moment.text,
              style: style,
              maxLines: _expanded ? null : _collapseLines,
              overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            ),
            // 「全文/收起」直接放在正文下方。
            if (overflows)
              GestureDetector(
                onTap: () => setState(() => _expanded = !_expanded),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _expanded ? '收起' : '全文',
                    style: TextStyle(
                      color: theme.colorScheme.primary,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 4),
            // 附件网格：正文下方、时间行上方（朋友圈位置）。
            if (moment.attachments.isNotEmpty) ...[
              const SizedBox(height: 8),
              AttachmentGrid(
                attachments: attachments,
                onTapTile: (index) => showMediaPreview(
                  context,
                  attachments: attachments,
                  initialIndex: index,
                ),
              ),
            ],
            // 位置行：附件下方、时间行上方（朋友圈样式，对齐 event_tile）。
            // name 优先展示；有坐标时整行可点打开高德；无 location 不渲染。
            if (moment.location != null)
              GestureDetector(
                onTap: moment.location!.hasCoordinates
                    ? () => _openLocation(moment.location!)
                    : null,
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(children: [
                    Icon(Icons.place_outlined,
                        size: 13, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(locationLabel(moment.location!),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 12, color: scheme.onSurfaceVariant)),
                    ),
                  ]),
                ),
              ),
            // 时间行：时间靠左，⋮ 菜单在最右。
            Row(
              children: [
                Expanded(
                  child: Text(
                    formatMomentTime(moment.createdAt),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.hintColor),
                  ),
                ),
                Theme(
                  data: Theme.of(context).copyWith(
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
                  child: PopupMenuButton<String>(
                    icon: const Icon(Icons.more_horiz),
                    iconSize: 18,
                    padding: EdgeInsets.zero,
                    tooltip: '更多',
                    onSelected: (value) {
                      if (value == 'comment') {
                        // 再点一次「评论」= 关闭输入框（不想评论了）。
                        setState(() => _showCommentInput = !_showCommentInput);
                        if (_showCommentInput) _commentFocus.requestFocus();
                      } else if (value == 'delete') {
                        _delete();
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'comment', child: Text('评论')),
                      PopupMenuItem(value: 'delete', child: Text('删除')),
                    ],
                  ),
                ),
              ],
            ),
            if (moment.comments.isNotEmpty) ...[
              _CommentBlock(comments: moment.comments),
            ],
            // 评论输入默认隐藏，点 ⋮ →「评论」才展开。
            if (_showCommentInput) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _commentController,
                      focusNode: _commentFocus,
                      maxLength: 2000,
                      maxLines: 3,
                      minLines: 1,
                      decoration: InputDecoration(
                        hintText: '写评论…',
                        isDense: true,
                        filled: true,
                        fillColor: scheme.surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide.none,
                        ),
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _submitting ? null : _submitComment,
                    icon: const Icon(Icons.send),
                    tooltip: '发送',
                  ),
                ],
              ),
              // 输入框与下方分割线之间留呼吸空间，避免贴住分隔符。
              const SizedBox(height: 8),
            ],
            // 有评论时：评论块与下方分割符之间留稍大的呼吸空间；无评论则紧贴时间行。
            if (moment.comments.isNotEmpty) const SizedBox(height: 8),
          ],
        );
      },
    );
  }
}

/// 内嵌评论块：浅底色圆角容器，每条评论完整展示（不缩字号、不做展开）。
class _CommentBlock extends StatelessWidget {
  const _CommentBlock({required this.comments});

  final List<MomentComment> comments;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final c in comments) CommentRow(comment: c),
        ],
      ),
    );
  }
}
