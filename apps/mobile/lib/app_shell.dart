import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'core/network/api_exception.dart';
import 'features/ai/widgets/session_title.dart';
import 'features/audit/audit_providers.dart';
import 'features/event/event_providers.dart';
import 'features/event/widgets/event_date_nav.dart';
import 'features/event/widgets/event_edit_page.dart';
import 'features/habit/widgets/habit_date_nav.dart';
import 'features/moment/moment_providers.dart';
import 'features/moment/widgets/attachment_picker_sheet.dart';
import 'features/task/task_providers.dart';
import 'features/task/task_edit_page.dart';
import 'providers.dart';

/// 主壳：AppBar + Drawer 侧栏，包住各模块页面。
/// 模块多、底部 tab 放不下，用滑出侧栏；加模块 = 在 [_items] 加一项。
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  static const _items = <({IconData icon, String label, String path})>[
    (icon: Icons.auto_awesome, label: '宁序', path: '/ai'),
    (icon: Icons.bolt, label: '闪记', path: '/moments'),
    (icon: Icons.repeat, label: '习惯', path: '/habit'),
    (icon: Icons.check_circle_outline, label: '任务', path: '/task'),
    (icon: Icons.calendar_today_outlined, label: '日历', path: '/event'),
    (icon: Icons.photo_library_outlined, label: '素材库', path: '/files'),
    (icon: Icons.receipt_long_outlined, label: '日志', path: '/audit'),
  ];

  /// 日志页顶部「全部已读」：成功后刷新列表/未读数并提示。
  Future<void> _markAllRead(BuildContext context, WidgetRef ref) async {
    try {
      final result = await ref.read(auditActionsProvider).markAllRead();
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已将 ${result.updatedCount} 条日志标记为已读')),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }

  /// 短按 +：弹附件选择框 → 选完带附件进入发布页；取消不跳转。
  Future<void> _addMomentWithAttachment(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final picked = await showAttachmentPickerSheet(context);
    if (picked == null || !context.mounted) return;
    ref.read(pickedAttachmentsProvider.notifier).set(picked);
    context.push('/moments/create');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;
    final counts = ref.watch(countsProvider);
    final auditUnread = ref.watch(auditUnreadCountProvider);
    final taskTodo = ref.watch(taskTodoCountProvider);
    final eventToday = ref.watch(eventTodayCountProvider);

    // 右侧 badge：闪记/任务/日历/日志走真实计数；习惯暂无计数接口，不显示。
    String? badgeFor(String path) => switch (path) {
      '/moments' => counts.hasValue ? '${counts.value}' : null,
      '/task' =>
        taskTodo.hasValue && taskTodo.value! > 0 ? '${taskTodo.value}' : null,
      '/event' =>
        eventToday.hasValue && eventToday.value! > 0
            ? '${eventToday.value}'
            : null,
      '/audit' =>
        auditUnread.hasValue && auditUnread.value! > 0
            ? '${auditUnread.value}'
            : null,
      _ => null,
    };

    // 抽屉选中态：模块子路由（如 /moments/123）也选中对应模块。
    bool isActive(String path) =>
        location == path || location.startsWith('$path/');

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu),
            tooltip: '菜单',
            onPressed: () {
              ref.invalidate(countsProvider); // 打开抽屉时刷新计数
              ref.invalidate(taskTodoCountProvider);
              ref.invalidate(eventTodayCountProvider);
              Scaffold.of(context).openDrawer();
            },
          ),
        ),
        title: location.startsWith('/ai')
            ? const AiSessionTitle()
            : location == '/habit'
            ? const HabitDateNav()
            : location == '/habit/overview'
            ? const Text('习惯总览')
            : location.startsWith('/event')
            ? const EventDateNav()
            : Text(moduleTitle(location)),
        // 添加按钮放右上角（不用右下角 FAB，避免挡住评论发送）。
        actions: [
          if (location == '/moments')
            Tooltip(
              message: '新建闪记',
              child: GestureDetector(
                // 短按弹选择框；长按直进发布页（微信同款：长按 = 纯文字）。
                // opaque：让含 Padding 的整片区域都参与命中，恢复约 48×48 触摸目标，
                // 否则只有 24×24 的 Icon 本体可点、长按稍偏即失效。
                behavior: HitTestBehavior.opaque,
                onTap: () => _addMomentWithAttachment(context, ref),
                onLongPress: () => context.push('/moments/create'),
                child: const Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(Icons.add),
                ),
              ),
            ),
          if (location.startsWith('/event'))
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: '新建日程',
              onPressed: () => context.push(
                '/event/edit',
                extra: EventEditArgs(day: ref.read(eventSelectedDayProvider)),
              ),
            ),
          // 习惯页：右上角「总览」+「新建习惯」（总览也有自己的返回导航）。
          if (location == '/habit') ...[
            IconButton(
              icon: const Icon(Icons.insights_outlined),
              tooltip: '习惯总览',
              onPressed: () => context.push('/habit/overview'),
            ),
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: '新建习惯',
              onPressed: () => context.push('/habit/edit'),
            ),
          ],
          // 任务页：新建任务放右上角（与闪记/日程一致；FAB 保留任务组 tab 的新建组）。
          if (location == '/task')
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: '新建任务',
              onPressed: () =>
                  context.push('/task/edit', extra: TaskEditArgs()),
            ),
          // 日志页：全部已读放顶部导航栏右侧（无未读时禁用）。
          if (location.startsWith('/audit'))
            TextButton.icon(
              onPressed: (auditUnread.value ?? 0) > 0
                  ? () => _markAllRead(context, ref)
                  : null,
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('全部已读'),
            ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Builder(
            builder: (drawerContext) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 侧栏顶部用品牌 header（像素 logo + Serenique 字标），和 Web 端一致。
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 12, 8),
                  child: SvgPicture.asset(
                    'assets/logo_header.svg',
                    width: 230,
                    height: 64,
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      // 模块列表可滚动（模块多了不溢出），设置仍固定在底部。
                      Expanded(
                        child: SingleChildScrollView(
                          child: Column(
                            children: [
                              for (final item in _items)
                                _NavItem(
                                  icon: item.icon,
                                  label: item.label,
                                  selected: isActive(item.path),
                                  badge: badgeFor(item.path),
                                  onTap: () {
                                    Scaffold.of(drawerContext).closeDrawer();
                                    context.go(item.path);
                                  },
                                ),
                            ],
                          ),
                        ),
                      ),
                      const Divider(),
                      _NavItem(
                        icon: Icons.settings_outlined,
                        label: '设置',
                        selected: location == '/settings',
                        onTap: () {
                          Scaffold.of(drawerContext).closeDrawer();
                          context.go('/settings');
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: child,
    );
  }
}

/// 顶部 AppBar 标题 = 当前所在模块名。
String moduleTitle(String path) {
  if (path.startsWith('/settings')) return '设置';
  if (path.startsWith('/moments')) return '闪记';
  if (path.startsWith('/habit')) return '习惯';
  if (path.startsWith('/task')) return '任务';
  if (path.startsWith('/event')) return '日历';
  if (path.startsWith('/files')) return '素材库';
  if (path.startsWith('/audit')) return '日志';
  if (path.startsWith('/ai')) return '宁序';
  return 'Serenique';
}

/// 侧栏条目：统一用 ListTile（图标与文字间距一致），支持选中态高亮与右侧计数 badge。
class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// 右侧计数徽章（null = 不显示）。
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      selected: selected,
      selectedTileColor: scheme.secondaryContainer.withValues(alpha: 0.4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      leading: Icon(icon),
      title: Text(label),
      trailing: badge == null ? null : _Badge(count: badge!),
      onTap: onTap,
    );
  }
}

/// 计数小徽章：圆角胶囊。
class _Badge extends StatelessWidget {
  const _Badge({required this.count});

  final String count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count,
        style: TextStyle(fontSize: 12, color: scheme.onSecondaryContainer),
      ),
    );
  }
}
