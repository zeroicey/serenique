// 助手消息渲染：thinking 折叠块 + Markdown 正文（历史静态 / 当前轮流式）+ 工具卡。
import 'package:flutter/material.dart';
import 'package:flutter_markdown_stream/flutter_markdown_stream.dart';
import 'package:url_launcher/url_launcher.dart';
import '../ai_models.dart';
import 'tool_card.dart';

/// 思考过程折叠块（默认折叠，对齐 Web）。
class ThinkingBlock extends StatelessWidget {
  const ThinkingBlock({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        dense: true,
        shape: const Border(),
        collapsedShape: const Border(),
        leading: Icon(Icons.psychology_outlined, size: 18, color: scheme.onSurfaceVariant),
        title: Text(
          '思考过程',
          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                text,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void _openLink(String text, String? href, String title) {
  if (href != null) launchUrl(Uri.parse(href));
}

/// 当前轮（流式中）：thinking + （无正文时「AI 正在思考…」指示，否则流式 Markdown）+ 工具卡。
class ActiveTurnView extends StatelessWidget {
  const ActiveTurnView({super.key, required this.turn});

  final TurnState turn;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        ThinkingBlock(text: turn.thinking),
        if (turn.text.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 8),
                Text(
                  'AI 正在思考…',
                  style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          )
        else
          MarkdownStream(
            stream: turn.textController.stream,
            onTapLink: _openLink,
            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
          ),
        ...turn.toolCards.values.map((c) => ToolCard(card: c)),
      ],
    );
  }
}

/// 历史助手消息（已完整）：静态 Markdown 渲染。
class AssistantMessageView extends StatelessWidget {
  const AssistantMessageView({super.key, required this.message});

  final RenderMessage message;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        ThinkingBlock(text: message.thinking),
        MarkdownBody(
          data: message.text,
          onTapLink: _openLink,
          styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
        ),
        ...message.toolCalls
            .map((tc) => ToolCard(
                  card: ToolCardState(
                    id: tc.id,
                    name: tc.name,
                    args: tc.args,
                    result: tc.result,
                    isError: tc.isError,
                    running: false,
                  ),
                )),
      ],
    );
  }
}
