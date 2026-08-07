import 'package:flutter/material.dart';
import '../moment_models.dart';
import '../moment_time.dart';

/// 朋友圈样式的闪记卡片：纯文本 + 时间 + 内嵌评论。
/// 没有头像昵称（个人使用）；附件功能暂不接入；评论直接显示在文本下方，不显示条数。
class MomentCard extends StatelessWidget {
  const MomentCard({super.key, required this.moment});

  final Moment moment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExpandableMomentText(
          text: moment.text,
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 6),
        Text(
          formatMomentTime(moment.createdAt),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.hintColor),
        ),
        if (moment.comments.isNotEmpty) ...[
          const SizedBox(height: 10),
          _CommentBlock(comments: moment.comments),
        ],
      ],
    );
  }
}

/// 长文本：默认收起 [collapseLines] 行，超出时显示「全文」/「收起」。
/// 阈值设得比较宽松（8 行），绝大多数闪记可以完整展示。
class ExpandableMomentText extends StatefulWidget {
  const ExpandableMomentText({
    super.key,
    required this.text,
    this.style,
    this.collapseLines = 8,
  });

  final String text;
  final TextStyle? style;
  final int collapseLines;

  @override
  State<ExpandableMomentText> createState() => _ExpandableMomentTextState();
}

class _ExpandableMomentTextState extends State<ExpandableMomentText> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = widget.style ?? theme.textTheme.bodyLarge;
    return LayoutBuilder(
      builder: (context, constraints) {
        // 用 TextPainter 判断收起状态下是否真的会溢出，避免短文本也显示「全文」。
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: widget.collapseLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              style: style,
              maxLines: _expanded ? null : widget.collapseLines,
              overflow:
                  _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            ),
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
          for (final c in comments)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Text(c.content),
            ),
        ],
      ),
    );
  }
}
