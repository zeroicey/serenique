/// 素材库 blob 元数据（对齐 services/api 的 BlobEntry 公开字段）。
/// 手写 fromJson，未知字段容忍（与 MomentBlob 同风格）。
class BlobEntry {
  const BlobEntry({
    required this.id,
    required this.originalName,
    required this.mimeType,
    required this.size,
    this.checksum = '',
    this.metadata = const {},
    this.width,
    this.height,
    this.duration,
    required this.createdAt,
    this.refCount = 0,
  });

  final String id;
  final String originalName;
  final String mimeType;
  final int size;
  final String checksum;
  final Map<String, dynamic> metadata;

  /// 图片/视频宽度（仅部分类型有）。
  final int? width;
  final int? height;

  /// 时长（毫秒），仅音视频有。
  final int? duration;

  final String createdAt;

  /// 被业务附件（blob_attachments）引用的数量；>0 时不可物理删除。
  final int refCount;

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');
  bool get isReferenced => refCount > 0;

  factory BlobEntry.fromJson(Map<String, dynamic> json) => BlobEntry(
    id: json['id'] as String,
    originalName: json['originalName'] as String? ?? '',
    mimeType: json['mimeType'] as String? ?? '',
    size: (json['size'] as num?)?.toInt() ?? 0,
    checksum: json['checksum'] as String? ?? '',
    metadata:
        (json['metadata'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
    width: (json['width'] as num?)?.toInt(),
    height: (json['height'] as num?)?.toInt(),
    duration: (json['duration'] as num?)?.toInt(),
    createdAt: json['createdAt'] as String? ?? '',
    refCount: (json['refCount'] as num?)?.toInt() ?? 0,
  );
}

/// 业务级附件引用（对齐 services/api 的 BlobAttachmentEntry）。
/// 删除 blob 前查此列表：非空则禁止删除。
class BlobAttachment {
  const BlobAttachment({
    required this.id,
    required this.blobId,
    required this.ownerType,
    required this.ownerId,
    this.role = 'attachment',
    this.displayName,
    this.sortOrder = 0,
    this.createdAt = '',
    this.updatedAt = '',
  });

  final String id;
  final String blobId;
  final String ownerType;
  final String ownerId;
  final String role;
  final String? displayName;
  final int sortOrder;
  final String createdAt;
  final String updatedAt;

  factory BlobAttachment.fromJson(Map<String, dynamic> json) => BlobAttachment(
    id: json['id'] as String,
    blobId: json['blobId'] as String,
    ownerType: json['ownerType'] as String? ?? '',
    ownerId: json['ownerId'] as String? ?? '',
    role: json['role'] as String? ?? 'attachment',
    displayName: json['displayName'] as String?,
    sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    createdAt: json['createdAt'] as String? ?? '',
    updatedAt: json['updatedAt'] as String? ?? '',
  );
}

/// 一页素材列表（对齐 GET /api/blobs 的 { items, total }）。
class BlobPage {
  const BlobPage({required this.items, required this.total});

  final List<BlobEntry> items;
  final int total;
}

/// DELETE /api/blobs/:id 的结果（对齐 Web BlobDeleteResult）。
/// - local 后端：204 无响应体 → deleteUrls 为空（后端已直接删文件）。
/// - r2 后端：200 + data.deleteUrls（原图 + 图片缩略图签名删除 URL），
///   客户端需直发网关 DELETE 完成对象删除（fire-and-forget，best-effort）。
class BlobDeleteResult {
  const BlobDeleteResult({required this.deleted, required this.deleteUrls});

  final bool deleted;
  final List<String> deleteUrls;

  factory BlobDeleteResult.fromJson(Map<String, dynamic> json) =>
      BlobDeleteResult(
        deleted: json['deleted'] as bool? ?? true,
        deleteUrls: (json['deleteUrls'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList(),
      );
}
