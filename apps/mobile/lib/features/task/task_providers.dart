import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'task_api.dart';
import 'task_models.dart';
import 'task_time.dart';

final taskApiProvider = Provider<TaskApi>((ref) => TaskApi(ref.watch(apiClientProvider)));

final taskGroupsProvider = FutureProvider<List<TaskGroupEntry>>((ref) async {
  return ref.watch(taskApiProvider).listGroups();
});

/// 抽屉 badge 用的未完成任务总数。
final taskTodoCountProvider = FutureProvider<int>((ref) async {
  return ref.watch(taskApiProvider).countUncompleted();
});

final taskTodayProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final api = ref.watch(taskApiProvider);
  final items = await api.listTasks(status: 'todo', dueDateTo: todayStr());
  final sorted = [...items]..sort((a, b) => (a.dueDate ?? '').compareTo(b.dueDate ?? ''));
  return sorted;
});

final taskWeekProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final (from, to) = weekRange();
  return ref.watch(taskApiProvider).listTasks(status: 'todo', dueDateFrom: from, dueDateTo: to);
});

final taskMonthProvider = FutureProvider<List<TaskEntry>>((ref) async {
  final (from, to) = monthRange();
  return ref.watch(taskApiProvider).listTasks(status: 'todo', dueDateFrom: from, dueDateTo: to);
});

final groupTasksProvider = FutureProvider.family<List<TaskEntry>, String>((ref, groupId) async {
  return ref.watch(taskApiProvider).listTasks(groupId: groupId);
});

/// 每个任务组卡片上的「未完成任务数」。
final groupTodoCountProvider = FutureProvider.family<int, String>((ref, groupId) async {
  final data = await ref.watch(taskApiProvider).countByGroup(groupId);
  return data;
});

/// groupId → 任务组标题（任务条目下方小字用）；组不存在时回退空串。
final groupTitleProvider = FutureProvider.family<String, String>((ref, groupId) async {
  final groups = await ref.watch(taskGroupsProvider.future);
  return groups.where((g) => g.id == groupId).map((g) => g.title).firstOrNull ?? '';
});

/// 写操作集中处：成功后 invalidate 对应 provider。
class TaskActions {
  TaskActions(this._ref);

  final Ref _ref;
  TaskApi get _api => _ref.read(taskApiProvider);

  Future<TaskGroupEntry> createGroup(String title) async {
    final g = await _api.createGroup(title);
    _ref.invalidate(taskGroupsProvider);
    return g;
  }

  Future<TaskGroupEntry> renameGroup(String id, String title) async {
    final g = await _api.updateGroup(id, title);
    _ref.invalidate(taskGroupsProvider);
    return g;
  }

  Future<void> deleteGroup(String id) async {
    await _api.deleteGroup(id);
    _ref.invalidate(taskGroupsProvider);
  }

  Future<TaskEntry> createTask({
    required String title,
    required String groupId,
    String? dueDate,
  }) async {
    final t = await _api.createTask(title: title, groupId: groupId, dueDate: dueDate);
    _invalidateAll();
    return t;
  }

  Future<TaskEntry> updateTask(
    String id, {
    String? title,
    String? groupId,
    String? status,
    String? dueDate,
    bool clearDueDate = false,
  }) async {
    final t = await _api.updateTask(id,
        title: title, groupId: groupId, status: status, dueDate: dueDate, clearDueDate: clearDueDate);
    _invalidateAll();
    return t;
  }

  Future<void> toggleDone(String id, bool done) async {
    await _api.updateTask(id, status: done ? 'done' : 'todo');
    _invalidateAll();
  }

  Future<void> deleteTask(String id) async {
    await _api.deleteTask(id);
    _invalidateAll();
  }

  void _invalidateAll() {
    _ref.invalidate(taskGroupsProvider);
    _ref.invalidate(taskTodayProvider);
    _ref.invalidate(taskWeekProvider);
    _ref.invalidate(taskMonthProvider);
    _ref.invalidate(taskTodoCountProvider);
  }
}

final taskActionsProvider = Provider<TaskActions>((ref) => TaskActions(ref));
