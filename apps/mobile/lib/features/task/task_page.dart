import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'task_due_list_view.dart';
import 'task_edit_page.dart';
import 'task_group_list_view.dart';
import 'task_providers.dart';
import 'task_time.dart';

/// 任务模块主页面：外层 AppShell 提供 AppBar + 抽屉，本页自带底部悬浮
/// NavigationBar（任务组 / 今日 / 本周 / 本月）。IndexedStack 保持各 tab 状态。
class TaskPage extends ConsumerStatefulWidget {
  const TaskPage({super.key});

  @override
  ConsumerState<TaskPage> createState() => _TaskPageState();
}

class _TaskPageState extends ConsumerState<TaskPage> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      TaskGroupListView(),
      TaskDueListView(kind: TaskDueKind.today),
      TaskDueListView(kind: TaskDueKind.week),
      TaskDueListView(kind: TaskDueKind.month),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _onFabPressed(),
        child: Icon(_index == 0 ? Icons.create_new_folder_outlined : Icons.add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.folder_outlined), selectedIcon: Icon(Icons.folder), label: '任务组'),
          NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: '今日'),
          NavigationDestination(icon: Icon(Icons.calendar_view_week_outlined), selectedIcon: Icon(Icons.calendar_view_week), label: '本周'),
          NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: '本月'),
        ],
      ),
    );
  }

  void _onFabPressed() async {
    if (_index == 0) {
      // 任务组 tab：FAB 新建任务组（对话框），不是任务编辑器
      final title = await showGroupNameDialog(context);
      if (title != null && context.mounted) {
        await ref.read(taskActionsProvider).createGroup(title);
      }
    } else {
      final preset = switch (_index) {
        1 => todayStr(),
        2 => weekRange().$1,
        _ => monthRange().$1,
      };
      context.push('/task/edit', extra: TaskEditArgs(presetDueDate: preset));
    }
  }
}
