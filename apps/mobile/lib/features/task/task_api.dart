import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';
import 'task_models.dart';

/// 任务的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
class TaskApi {
  TaskApi(this._client);

  final ApiClient _client;

  /// 未完成任务数：status=todo 轻量拉一页读 total。
  Future<int> countUncompleted() async {
    final data = await _client.getData('/api/tasks',
        query: {'status': 'todo', 'page': 1, 'pageSize': 1});
    return (data as Map<String, dynamic>)['total'] as int;
  }

  Future<List<TaskGroupEntry>> listGroups() async {
    final data = await _client.getData('/api/task-groups', query: {'page': 1, 'pageSize': 50});
    return unwrapItems(data).map((e) => TaskGroupEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<TaskGroupEntry> createGroup(String title) async {
    final data = await _client.postData('/api/task-groups', body: {'title': title});
    return TaskGroupEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<TaskGroupEntry> updateGroup(String id, String title) async {
    final data = await _client.putData('/api/task-groups/$id', body: {'title': title});
    return TaskGroupEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteGroup(String id) async => _client.deleteData('/api/task-groups/$id');

  Future<List<TaskEntry>> listTasks({
    String? groupId,
    String? status,
    String? dueDateFrom,
    String? dueDateTo,
  }) async {
    final data = await _client.getData('/api/tasks', query: {
      'page': 1,
      'pageSize': 50,
      'groupId': ?groupId,
      'status': ?status,
      'dueDateFrom': ?dueDateFrom,
      'dueDateTo': ?dueDateTo,
    });
    return unwrapItems(data).map((e) => TaskEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<TaskEntry> createTask({required String title, required String groupId, String? dueDate}) async {
    final data = await _client.postData('/api/tasks', body: {
      'title': title,
      'groupId': groupId,
      'dueDate': ?dueDate,
    });
    return TaskEntry.fromJson(data as Map<String, dynamic>);
  }

  /// [dueDate] 显式传 null = 清除截止日期；不传 = 保持不变。
  Future<TaskEntry> updateTask(
    String id, {
    String? title,
    String? groupId,
    String? status,
    String? dueDate,
    bool clearDueDate = false,
  }) async {
    final data = await _client.putData('/api/tasks/$id', body: {
      'title': ?title,
      'groupId': ?groupId,
      'status': ?status,
      if (clearDueDate) 'dueDate': null,
      if (!clearDueDate) 'dueDate': ?dueDate,
    });
    return TaskEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteTask(String id) async => _client.deleteData('/api/tasks/$id');

  /// 轻量取某组未完成数：pageSize=1 读 total（组卡片徽标用）。
  Future<int> countByGroup(String groupId) async {
    final data = await _client.getData('/api/tasks',
        query: {'groupId': groupId, 'status': 'todo', 'page': 1, 'pageSize': 1});
    return (data as Map<String, dynamic>)['total'] as int;
  }
}
