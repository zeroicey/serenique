import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import '../moment_models.dart';

/// 评论行：DiceBear 像素头像（seed=评论id，与 Web 端一致）放在首行左侧，文字环绕它——
/// 首行让位给头像，换行后的行顶到最左边、利用头像下方的空间，不会在左侧空一列。
///
/// 实现：不能直接用前置 WidgetSpan 头像（实测换行后的行会跟着缩进到头像右侧，形成
/// 空列）。改为用 `TextPainter` 把评论切成「首行（头像右侧）」+「其余（顶格全宽）」
/// 两段渲染。
class CommentRow extends StatelessWidget {
  const CommentRow({super.key, required this.comment, this.onLongPress});

  final MomentComment comment;

  /// 长按回调（详情页用于弹出删除菜单；信息流不传则不可长按）。
  final VoidCallback? onLongPress;

  static const double _avatarSize = 24;
  static const double _gap = 8;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodyMedium!;
    final content = comment.content;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final avatar = CommentAvatar(
                    seed: comment.id,
                    size: _avatarSize,
                  );
                  final line1Width = constraints.maxWidth - _avatarSize - _gap;
                  final painter = TextPainter(
                    text: TextSpan(text: content, style: style),
                    textDirection: TextDirection.ltr,
                  )..layout(maxWidth: line1Width);
                  // 在头像右侧宽度内放得下一整条 → 单行简单排。
                  if (painter.computeLineMetrics().length <= 1) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        avatar,
                        const SizedBox(width: _gap),
                        Expanded(child: Text(content, style: style)),
                      ],
                    );
                  }
                  // 超出一行：切出首行（头像右侧宽度内），其余顶格从最左排。
                  final split = painter
                      .getLineBoundary(const TextPosition(offset: 0))
                      .end;
                  if (split <= 0 || split >= content.length) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        avatar,
                        const SizedBox(width: _gap),
                        Expanded(child: Text(content, style: style)),
                      ],
                    );
                  }
                  final first = content.substring(0, split);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          avatar,
                          const SizedBox(width: _gap),
                          Expanded(
                            child: Text(
                              first,
                              style: style,
                              maxLines: 1,
                              overflow: TextOverflow.clip,
                            ),
                          ),
                        ],
                      ),
                      Text(content.substring(split), style: style),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// DiceBear 像素头像。seed 用评论 id → 每条评论头像不同且与 Web 端一致。
/// 自己 fetch SVG 字节（try/catch 兜住所有失败），成功用 `SvgPicture.string`
/// 渲染，加载中/失败展示按 seed 哈希取色的圆形人形占位。不用
/// `SvgPicture.network`——它在 widget 测试环境会抛未处理的异步异常。
class CommentAvatar extends StatefulWidget {
  const CommentAvatar({super.key, required this.seed, this.size = 24});

  final String seed;
  final double size;

  @override
  State<CommentAvatar> createState() => _CommentAvatarState();
}

class _CommentAvatarState extends State<CommentAvatar> {
  static const _baseUrl = 'https://api.dicebear.com/7.x/pixel-art/svg';

  /// seed → SVG 内容，同一评论 id 不重复请求（列表与详情共用）。
  static final Map<String, String> _cache = {};

  static const _palette = <Color>[
    Color(0xFF5C6BC0), // indigo
    Color(0xFF26A69A), // teal
    Color(0xFFEF5350), // red
    Color(0xFFAB47BC), // purple
    Color(0xFFFFA726), // orange
    Color(0xFF66BB6A), // green
    Color(0xFF42A5F5), // blue
    Color(0xFF8D6E63), // brown
  ];

  String? _svg;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final seed = widget.seed;
    final cached = _cache[seed];
    if (cached != null) {
      _svg = cached; // initState 里直接赋值，无需 setState
      return;
    }
    try {
      final res = await http.get(Uri.parse('$_baseUrl?seed=$seed'));
      if (res.statusCode == 200) {
        _cache[seed] = res.body;
        if (mounted) setState(() => _svg = res.body);
      }
    } catch (_) {
      // 加载失败：保持 fallback，不抛未处理异常
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _palette[widget.seed.hashCode.abs() % _palette.length];
    final svg = _svg;
    return ClipOval(
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: svg != null
            ? SvgPicture.string(svg, fit: BoxFit.cover)
            : _fallback(color),
      ),
    );
  }

  Widget _fallback(Color color) => ColoredBox(
    color: color,
    child: Icon(Icons.person, size: widget.size * 0.65, color: Colors.white),
  );
}
