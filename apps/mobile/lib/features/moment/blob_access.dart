/// 一条签名访问链接：URL + 过期时间（后端返回 unix 秒）。
class BlobAccessLink {
  const BlobAccessLink({required this.url, required this.expiresAt});

  final String url;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().isAfter(expiresAt);
}

/// 签名链接内存缓存：命中且未过期直接返回；过期重新申请；申请失败回退直链。
/// 纯 Dart，无 Riverpod/网络依赖，便于单测。
class BlobAccessService {
  BlobAccessService({required this.fetchLink, required this.directUrl});

  /// 申请签名链接（真实实现 = POST /api/blobs/:id/access-link）。
  final Future<BlobAccessLink> Function(String blobId) fetchLink;

  /// 失败回退的直链（真实实现 = baseUrl + /api/blobs/:id/file）。
  final String Function(String blobId) directUrl;

  final Map<String, BlobAccessLink> _cache = {};

  Future<String> resolve(String blobId) async {
    final cached = _cache[blobId];
    if (cached != null && !cached.isExpired) return cached.url;
    try {
      final link = await fetchLink(blobId);
      _cache[blobId] = link;
      return link.url;
    } catch (_) {
      // 失败不缓存：下次重建时重新尝试签名链接。
      return directUrl(blobId);
    }
  }

  void clear() => _cache.clear();
}
