import '../../../core/network/api_client.dart';

/// 任务的 HTTP 封装（当前只接了计数，列表/增删改后续补）。
class TaskApi {
  TaskApi(this._client);

  final ApiClient _client;

  /// 未完成任务数：status=todo 轻量拉一页读 total。
  Future<int> countUncompleted() async {
    final data = await _client.getData('/api/tasks',
        query: {'status': 'todo', 'page': 1, 'pageSize': 1});
    return (data as Map<String, dynamic>)['total'] as int;
  }
}
