import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import 'credentials_tab.dart';
import 'profile_tab.dart';
import 'tokens_tab.dart';

/// 设置页：三 tab（个人信息 / 登录凭证 / API 令牌），底部固定退出登录。
/// 挂在 ShellRoute 内，AppBar（菜单按钮）与 Drawer 始终可用，可随时返回。
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: auth.isAuthenticated
          ? SafeArea(
              child: Column(
                children: [
                  Expanded(
                    child: DefaultTabController(
                      length: 3,
                      child: Column(
                        children: [
                          const TabBar(
                            tabs: [
                              Tab(text: '个人信息'),
                              Tab(text: '登录凭证'),
                              Tab(text: 'API 令牌'),
                            ],
                          ),
                          Expanded(
                            child: TabBarView(
                              children: const [
                                ProfileTab(),
                                CredentialsTab(),
                                TokensTab(),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          ref.read(authControllerProvider.notifier).logout(),
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('退出登录'),
                    ),
                  ),
                ],
              ),
            )
          : const Center(child: Text('未登录')),
    );
  }
}
