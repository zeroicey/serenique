import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';
import 'blob_access.dart';
import 'moment_models.dart';

/// moment 的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
class MomentApi {
  MomentApi(this._client);

  final ApiClient _client;

  Future<List<Moment>> list({int page = 1, int pageSize = 50}) async {
    final data = await _client
        .getData('/api/moments', query: {'page': page, 'pageSize': pageSize});
    return unwrapItems(data)
        .map((e) => Moment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 轻量取总数：只拉一页 pageSize=1，读响应里的 total。
  Future<int> count() async {
    final data =
        await _client.getData('/api/moments', query: {'page': 1, 'pageSize': 1});
    return (data as Map<String, dynamic>)['total'] as int;
  }

  Future<Moment> get(String id) async {
    final data = await _client.getData('/api/moments/$id');
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> create(String text) async {
    final data = await _client.postData('/api/moments', body: {'text': text});
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> update(String id, String text) async {
    final data =
        await _client.putData('/api/moments/$id', body: {'text': text});
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _client.deleteData('/api/moments/$id');
  }

  Future<List<MomentComment>> listComments(String momentId) async {
    final data = await _client.getData('/api/moments/$momentId/comments');
    return (data as List<dynamic>)
        .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MomentComment> addComment(String momentId, String content) async {
    final data = await _client
        .postData('/api/moments/$momentId/comments', body: {'content': content});
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<MomentComment> updateComment(
      String momentId, String commentId, String content) async {
    final data = await _client.putData('/api/moments/$momentId/comments/$commentId',
        body: {'content': content});
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteComment(String momentId, String commentId) async {
    await _client.deleteData('/api/moments/$momentId/comments/$commentId');
  }

  /// 申请 blob 签名访问链接，返回完整 URL 与过期时间。
  /// 对齐 Web `resolveApiPath`：用相对 path + 客户端 apiBase 拼接，
  /// 而非后端拼好的完整 url —— 路由反代（如 api.hcyj.xyz/serenique）会
  /// 剥离前缀再转发，后端返回的 url 会丢前缀导致 404。
  Future<BlobAccessLink> createBlobAccessLink(String blobId) async {
    final data = await _client.postData('/api/blobs/$blobId/access-link',
        body: {'expiresInSeconds': 3600});
    final path = data['path'] as String;
    final expires = (data['expires'] as num).toInt();
    return BlobAccessLink(
      url: '$_apiBase$path',
      expiresAt: DateTime.fromMillisecondsSinceEpoch(expires * 1000),
    );
  }

  String get _apiBase => _client.apiBase;
}
