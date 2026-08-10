// 工具调用卡片：工具名 + 状态（运行中/成功/失败）+ 参数与结果（可展开）。
import 'dart:convert';

import 'package:flutter/material.dart';
import '../ai_models.dart';

class ToolCard extends StatelessWidget {
  const ToolCard({super.key, required this.card});

  final ToolCardState card;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget status = card.running
        ? const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Icon(
            card.isError ? Icons.error_outline : Icons.check_circle_outline,
            size: 16,
            color: card.isError ? scheme.error : scheme.primary,
          );

    final argsText = _stringify(card.args);

    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Icon(Icons.auto_awesome, size: 16, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    card.name,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                status,
              ],
            ),
          ),
          if (argsText.isNotEmpty)
            _CollapsibleRow(title: '参数', content: argsText),
          if (card.result.isNotEmpty)
            _CollapsibleRow(
              title: '结果',
              content: card.result,
              error: card.isError,
            ),
        ],
      ),
    );
  }

  static String _stringify(Object? value) {
    if (value == null) return '';
    if (value is String) return value;
    try {
      return const JsonEncoder.withIndent('  ').convert(value);
    } catch (_) {
      return value.toString();
    }
  }
}

class _CollapsibleRow extends StatelessWidget {
  const _CollapsibleRow({required this.title, required this.content, this.error = false});

  final String title;
  final String content;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        dense: true,
        shape: const Border(),
        collapsedShape: const Border(),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 12,
            color: error ? scheme.error : scheme.onSurfaceVariant,
          ),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Text(
                content,
                style: TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: error ? scheme.error : scheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
