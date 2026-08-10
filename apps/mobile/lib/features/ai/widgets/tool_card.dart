// 工具调用卡片：默认只显示头部（工具名 + 状态），点击整卡一次展开参数与结果。
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
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          dense: true,
          shape: const Border(),
          collapsedShape: const Border(),
          // 头部行：图标 + 工具名；状态放 trailing（替代默认箭头，保持头部干净）。
          title: Row(
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
            ],
          ),
          trailing: status,
          children: [
            if (argsText.isNotEmpty)
              _DetailBlock(label: '参数', content: argsText, error: false),
            if (card.result.isNotEmpty)
              _DetailBlock(label: '结果', content: card.result, error: card.isError),
          ],
        ),
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

/// 展开后的详情块：小标签 + 等宽正文。
class _DetailBlock extends StatelessWidget {
  const _DetailBlock({required this.label, required this.content, required this.error});

  final String label;
  final String content;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = error ? scheme.error : scheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: color)),
          const SizedBox(height: 2),
          Text(
            content,
            style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: color),
          ),
        ],
      ),
    );
  }
}
