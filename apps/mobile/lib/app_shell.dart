import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 主壳：AppBar + Drawer 侧栏，包住各模块页面。
/// 模块多、底部 tab 放不下，用滑出侧栏；加模块 = 在 [_items] 加一项。
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  static const _items = <({IconData icon, String label, String path})>[
    (icon: Icons.bolt, label: '闪记', path: '/moments'),
    (icon: Icons.book_outlined, label: '日记', path: '/diary'),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final selected = _items.indexWhere((e) => location == e.path);

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu),
            tooltip: '菜单',
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        title: const Text('Serenique'),
      ),
      drawer: Builder(
        builder: (drawerContext) => NavigationDrawer(
          selectedIndex: selected < 0 ? null : selected,
          onDestinationSelected: (index) {
            Scaffold.of(drawerContext).closeDrawer();
            context.go(_items[index].path);
          },
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 20, 16, 8),
              child: Text(
                'Serenique',
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            for (final item in _items)
              NavigationDrawerDestination(
                icon: Icon(item.icon),
                label: Text(item.label),
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('设置'),
              onTap: () => context.go('/settings'),
            ),
          ],
        ),
      ),
      body: child,
    );
  }
}
