import 'package:go_router/go_router.dart';
import 'app_shell.dart';
import 'features/auth/login_page.dart';
import 'features/diary/diary_edit_page.dart';
import 'features/diary/diary_list_page.dart';
import 'features/moment/moment_create_page.dart';
import 'features/moment/moment_detail_page.dart';
import 'features/moment/moment_list_page.dart';

/// 模块页在 Drawer 壳内；详情/编辑/登录页全屏 push。
final appRouter = GoRouter(
  initialLocation: '/moments',
  routes: [
    ShellRoute(
      builder: (context, state, child) => AppShell(child: child),
      routes: [
        GoRoute(path: '/moments', builder: (context, state) => const MomentListPage()),
        GoRoute(path: '/diary', builder: (context, state) => const DiaryListPage()),
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
