import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'app_shell.dart';
import 'features/auth/auth_providers.dart';
import 'features/auth/login_page.dart';
import 'features/auth/splash_page.dart';
import 'features/ai/ai_page.dart';
import 'features/audit/audit_page.dart';
import 'features/blob/blob_page.dart';
import 'features/event/event_page.dart';
import 'features/event/widgets/event_edit_page.dart';
import 'features/habit/habit_overview_page.dart';
import 'features/habit/habit_page.dart';
import 'features/habit/widgets/habit_edit_page.dart';
import 'features/moment/moment_create_page.dart';
import 'features/moment/moment_detail_page.dart';
import 'features/moment/moment_list_page.dart';
import 'features/settings/settings_page.dart';
import 'features/tag/tag_page.dart';
import 'features/task/task_group_detail_page.dart';
import 'features/task/task_edit_page.dart';
import 'features/task/task_page.dart';
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
          GoRoute(
            path: '/moments',
            builder: (context, state) => const MomentListPage(),
          ),
          GoRoute(path: '/tags', builder: (context, state) => const TagPage()),
          GoRoute(path: '/task', builder: (context, state) => const TaskPage()),
          GoRoute(
            path: '/event',
            builder: (context, state) => const EventPage(),
          ),
          GoRoute(
            path: '/habit',
            builder: (context, state) => const HabitPage(),
          ),
          GoRoute(
            path: '/habit/overview',
            builder: (context, state) => const HabitOverviewPage(),
          ),
          GoRoute(
            path: '/files',
            builder: (context, state) => const BlobLibraryPage(),
          ),
          GoRoute(
            path: '/audit',
            builder: (context, state) => const AuditPage(),
          ),
          GoRoute(path: '/ai', builder: (context, state) => const AiPage()),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsPage(),
          ),
        ],
      ),
      GoRoute(
        path: '/moments/create',
        builder: (context, state) => const MomentCreatePage(),
      ),
      // 日程新建/编辑全屏页：ShellRoute 之外，自持 Scaffold/AppBar。
      GoRoute(
        path: '/event/edit',
        builder: (context, state) => EventEditPage(
          args: (state.extra as EventEditArgs?) ?? const EventEditArgs(),
        ),
      ),
      // 习惯新建/编辑全屏页：与 /event/edit 同模型（ShellRoute 之外，自持 Scaffold/AppBar）。
      GoRoute(
        path: '/habit/edit',
        builder: (context, state) => HabitEditPage(
          args: (state.extra as HabitEditArgs?) ?? const HabitEditArgs(),
        ),
      ),
      // 任务新建/编辑全屏页：与 /event/edit 同模型（ShellRoute 之外，自持 Scaffold/AppBar）。
      GoRoute(
        path: '/task/edit',
        builder: (context, state) => TaskEditPage(
          args: (state.extra as TaskEditArgs?) ?? const TaskEditArgs(),
        ),
      ),
      GoRoute(
        path: '/moments/:id',
        builder: (context, state) =>
            MomentDetailPage(id: state.pathParameters['id']!),
      ),
      // 任务组详情全屏页：与 /moments/:id 同模型（ShellRoute 之外，自持 AppBar/返回）。
      GoRoute(
        path: '/task/groups/:id',
        builder: (context, state) =>
            TaskGroupDetailPage(groupId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
    ],
  );
});
