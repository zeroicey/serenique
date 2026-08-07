import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'app_shell.dart';
import 'features/auth/auth_providers.dart';
import 'features/auth/login_page.dart';
import 'features/auth/splash_page.dart';
import 'features/diary/diary_edit_page.dart';
import 'features/diary/diary_list_page.dart';
import 'features/moment/moment_create_page.dart';
import 'features/moment/moment_detail_page.dart';
import 'features/moment/moment_list_page.dart';
import 'features/placeholder/placeholder_page.dart';
import 'features/settings/settings_page.dart';
import 'providers.dart';

/// 声明式路由。未认证 → /login；启动读 Keychain → /splash；认证通过进 /moments。
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: ref.watch(routerRefreshProvider),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      if (auth.initializing) return loc == '/splash' ? null : '/splash';
      if (!auth.isAuthenticated) return loc == '/login' ? null : '/login';
      // 已认证：/splash 与 /login 都回主界面；设置页独立为 /settings
      if (loc == '/splash' || loc == '/login') return '/moments';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/moments', builder: (context, state) => const MomentListPage()),
          GoRoute(path: '/diary', builder: (context, state) => const DiaryListPage()),
          GoRoute(path: '/task', builder: (context, state) => const PlaceholderPage(title: '任务', icon: Icons.check_circle_outline)),
          GoRoute(path: '/event', builder: (context, state) => const PlaceholderPage(title: '日历', icon: Icons.calendar_today_outlined)),
          GoRoute(path: '/ai', builder: (context, state) => const PlaceholderPage(title: '宁序', icon: Icons.auto_awesome)),
          GoRoute(path: '/settings', builder: (context, state) => const SettingsPage()),
        ],
      ),
      GoRoute(path: '/moments/create', builder: (context, state) => const MomentCreatePage()),
      GoRoute(
        path: '/moments/:id',
        builder: (context, state) => MomentDetailPage(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/diary/:date',
        builder: (context, state) => DiaryEditPage(date: state.pathParameters['date']!),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
    ],
  );
});
