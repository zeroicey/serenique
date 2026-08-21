import '../../../core/network/api_client.dart';
import '../blob/blob_access.dart';
import 'blob_models.dart';

/// blob（素材）的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
/// 契约以 services/api 源码为准：
///   GET    /api/blobs?page&pageSize&mimeType= → { items, total }
///   GET    /api/blobs/:id/attachments          → BlobAttachmentEntry[]
///   DELETE /api/blobs/:id                      → 被引用时 409（中文 message）
///   POST   /api/blobs/:id/access-link          → { path, expires, signature }
class BlobApi {
  BlobApi(this._client);

  final ApiClient _client;

  /// 分页列表。[mimeType] 为类型前缀（如 'image/'），null = 全部。
  Future<BlobPage> list({
    int page = 1,
    int pageSize = 48,
    String? mimeType,
  }) async {
    final data = await _client.getData(
      '/api/blobs',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (mimeType != null && mimeType.isNotEmpty) 'mimeType': mimeType,
      },
    );
    final map = data as Map<String, dynamic>;
    return BlobPage(
      items: (map['items'] as List<dynamic>? ?? const [])
          .map((e) => BlobEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (map['total'] as num?)?.toInt() ?? 0,
    );
  }

  /// 查一个 blob 的所有业务引用（删除前判断引用方）。
  Future<List<BlobAttachment>> listAttachments(String blobId) async {
    final data = await _client.getData('/api/blobs/$blobId/attachments');
    return (data as List<dynamic>? ?? const [])
        .map((e) => BlobAttachment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 删除物理 blob。被引用时后端 409 → ApiException（中文 message 透传）。
  Future<void> delete(String blobId) async {
    await _client.deleteData('/api/blobs/$blobId');
  }

  /// 申请 blob 签名访问链接（对齐 Web resolveApiPath：绝对 URL 原样返回，
  /// 相对 path 拼 apiBase——R2 生产直链 / 本地代理回退都正确）。
  Future<BlobAccessLink> createBlobAccessLink(String blobId) async {
    final data = await _client.postData(
      '/api/blobs/$blobId/access-link',
      body: {'expiresInSeconds': 3600},
    );
    final path = data['path'] as String;
    final expires = (data['expires'] as num).toInt();
    final url = path.startsWith('http') ? path : '${_client.apiBase}$path';
    return BlobAccessLink(
      url: url,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(expires * 1000),
    );
  }
}