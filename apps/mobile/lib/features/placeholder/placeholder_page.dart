import 'package:flutter/material.dart';

/// 占位页：功能开发中。侧边栏新模块（AI/任务/日历）暂用。
class PlaceholderPage extends StatelessWidget {
  const PlaceholderPage({super.key, required this.title, this.icon});

  final String title;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon ?? Icons.construction,
                size: 48, color: scheme.outline),
            const SizedBox(height: 12),
            Text('「$title」功能开发中', style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}
