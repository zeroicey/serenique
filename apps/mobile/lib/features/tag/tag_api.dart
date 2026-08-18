import '../../../core/network/api_client.dart';
import '../moment/moment_models.dart';

/// 标签（tag 模块）HTTP 封装：只负责「请求 + 把 data 解成模型」。
/// 端点对齐 services/api 的 tag 模块（独立资源 + 通用关联）。
class TagApi {
  TagApi(this._client);

  final ApiClient _client;

  /// 标签列表（默认拉满一页 pageSize=50；应用个人场景标签量级不会冲破上限）。
  /// 返回 TagEntry { id, name, momentCount, createdAt, updatedAt }。
  Future<List<MomentTag>> list() async {
    final data = await _client.getData(
      '/api/tags',
      query: {'page': 1, 'pageSize': 50},
    );
    final map = data as Map<String, dynamic>;
    return (map['items'] as List<dynamic>? ?? const [])
        .map((e) => MomentTag.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 创建标签：name 必填、trim、小写归一化、唯一；重名 → 409（上层转提示）。
  Future<MomentTag> create(String name) async {
    final data = await _client.postData('/api/tags', body: {'name': name});
    return MomentTag.fromJson(data as Map<String, dynamic>);
  }

  /// 重命名：仍走唯一性校验（重名 → 409）；改名后已绑定关系保持（挂在 tag_id 上）。
  Future<MomentTag> rename(String id, String name) async {
    final data = await _client.putData('/api/tags/$id', body: {'name': name});
    return MomentTag.fromJson(data as Map<String, dynamic>);
  }

  /// 删除标签：级联删其全部关联行（204）。
  Future<void> delete(String id) async {
    await _client.deleteData('/api/tags/$id');
  }
}
