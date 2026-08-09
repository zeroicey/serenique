import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';

/// 设置页：显示登录状态、打码令牌与「退出登录」。
/// 挂在 ShellRoute 内，AppBar（菜单按钮）与 Drawer 始终可用，可随时返回。
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  String _mask(String token) {
    if (token.length <= 8) return '*' * token.length;
    return '${token.substring(0, 4)}…${token.substring(token.length - 4)}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: Center(
        child: auth.isAuthenticated
            ? _loggedIn(context, auth.token!, ref)
            : const Text('未登录'),
      ),
    );
  }

  Widget _loggedIn(BuildContext context, String token, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_outline, size: 48),
          const SizedBox(height: 12),
          const Text('已登录'),
          const SizedBox(height: 4),
          Text(_mask(token), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          Text('令牌在 Web 端设置页「API 令牌」创建/管理',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            child: const Text('退出登录'),
          ),
        ],
      ),
    );
  }
}
