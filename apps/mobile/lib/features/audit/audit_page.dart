import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'audit_models.dart';
import 'audit_providers.dart';

/// 服务端审计日志页（侧边栏「日志」）。
///
/// 列表（时间/级别/事件/消息/来源/IP/已读）+ 级别与未读筛选 + 全部置已读 + 未读计数。
/// 只读，无删除。后端接口未上线时（404）优雅降级为错误态。
class AuditPage extends ConsumerWidget {
  const AuditPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(auditListProvider);
    return Scaffold(
      body: Column(
        children: [
          const _AuditFilterBar(),
          const Divider(height: 1),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(auditListProvider);
                ref.invalidate(auditUnreadCountProvider);
                await ref.read(auditListProvider.future);
              },
              child: list.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, _) => AsyncErrorView(
                  error: err,
                  message: _auditErrorMessage(err),
                  onRetry: () {
                    ref.invalidate(auditListProvider);
                    ref.invalidate(auditUnreadCountProvider);
                  },
                ),
                data: (page) {
                  if (page.items.isEmpty) {
                    final filter = ref.read(auditFilterProvider);
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        ListTile(
                          title: Text(
                            filter.unreadOnly ? '没有未读日志' : '暂无日志',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: page.items.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: 1, indent: 16, endIndent: 16),
                    itemBuilder: (context, index) =>
                        _AuditLogTile(entry: page.items[index]),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 后端 404（接口未上线）时给更友好的中文提示，其余透传后端错误文案。
String _auditErrorMessage(Object error) {
  if (error is ApiException && error.statusCode == 404) {
    return '日志功能暂不可用：后端尚未上线日志接口，请稍后再试。';
  }
  return humanizeError(error);
}

/// 筛选条（单行）：未读切换 + 级别单选（信息/警告/错误，无「全部」，点已选项取消）。
/// 布局用横向滚动兜底，保证一行显示完。
class _AuditFilterBar extends ConsumerWidget {
  const _AuditFilterBar();

  static const _levels = <({String value, String label})>[
    (value: 'info', label: '信息'),
    (value: 'warn', label: '警告'),
    (value: 'error', label: '错误'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(auditFilterProvider);
    final notifier = ref.read(auditFilterProvider.notifier);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            FilterChip(
              label: const Text('未读'),
              selected: filter.unreadOnly,
              onSelected: notifier.setUnreadOnly,
            ),
            for (final level in _levels)
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: ChoiceChip(
                  label: Text(level.label),
                  selected: filter.level == level.value,
                  onSelected: (_) => notifier.toggleLevel(level.value),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// 单条日志：级别图标（彩色）+ 消息 + 时间/事件 + 来源/IP + 未读圆点。
class _AuditLogTile extends StatelessWidget {
  const _AuditLogTile({required this.entry});

  final AuditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final levelColor = switch (entry.level) {
      AuditLevel.info => scheme.primary,
      AuditLevel.warn => Colors.orange.shade700,
      AuditLevel.error => scheme.error,
    };
    final levelIcon = switch (entry.level) {
      AuditLevel.info => Icons.info_outline,
      AuditLevel.warn => Icons.warning_amber_rounded,
      AuditLevel.error => Icons.error_outline,
    };
    final meta = <String>[
      if (entry.source != null && entry.source!.isNotEmpty) '来源 ${entry.source}',
      if (entry.ip != null && entry.ip!.isNotEmpty) 'IP ${entry.ip}',
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(levelIcon, size: 20, color: levelColor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.message,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.3,
                    fontWeight:
                        entry.isRead ? FontWeight.normal : FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${_formatAuditTime(entry.createdAt)} · '
                  '${entry.level.label} · ${entry.event}',
                  style: TextStyle(fontSize: 12, color: scheme.outline),
                ),
                if (meta.isNotEmpty)
                  Text(
                    meta,
                    style: TextStyle(fontSize: 12, color: scheme.outline),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (!entry.isRead) _UnreadDot(color: scheme.error),
        ],
      ),
    );
  }
}

/// 未读小圆点。
class _UnreadDot extends StatelessWidget {
  const _UnreadDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 6),
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
}

/// 把后端 ISO 时间转成本地「yyyy-MM-dd HH:mm」。
String _formatAuditTime(String iso) {
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return iso;
  return DateFormat('yyyy-MM-dd HH:mm').format(dt);
}
