import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers.dart';

/// 主壳：AppBar + Drawer 侧栏，包住各模块页面。
/// 模块多、底部 tab 放不下，用滑出侧栏；加模块 = 在 [_items] 加一项。
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  static const _items = <({IconData icon, String label, String path})>[
    (icon: Icons.bolt, label: '闪记', path: '/moments'),
    (icon: Icons.book_outlined, label: '日记', path: '/diary'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;
    final counts = ref.watch(countsProvider);

    String? badgeFor(String path) => switch (path) {
          '/moments' => counts.hasValue ? '${counts.value!.moments}' : null,
          '/diary' => counts.hasValue ? '${counts.value!.diaries}' : null,
          _ => null,
        };

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu),
            tooltip: '菜单',
            onPressed: () {
              ref.invalidate(countsProvider); // 打开抽屉时刷新计数
              Scaffold.of(context).openDrawer();
            },
          ),
        ),
        title: const Text('Serenique'),
        // 添加按钮放右上角（不用右下角 FAB，避免挡住评论发送）。
        actions: [
          if (location == '/moments')
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: '新建闪记',
              onPressed: () => context.push('/moments/create'),
            ),
          if (location == '/diary')
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: '写今天',
              onPressed: () => context.push(
                '/diary/${DateFormat('yyyy-MM-dd').format(DateTime.now())}',
              ),
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
                      for (final item in _items)
                        _NavItem(
                          icon: item.icon,
                          label: item.label,
                          selected: location == item.path,
                          badge: badgeFor(item.path),
                          onTap: () {
                            Scaffold.of(drawerContext).closeDrawer();
                            context.go(item.path);
                          },
                        ),
                      // 设置固定在底部，上方加分隔符，图标与上方条目对齐。
                      const Spacer(),
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
