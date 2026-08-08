class MomentComment {
  const MomentComment({
    required this.id,
    required this.momentId,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String momentId;
  final String content;
  final String createdAt;
  final String updatedAt;

  factory MomentComment.fromJson(Map<String, dynamic> json) => MomentComment(
        id: json['id'] as String,
        momentId: json['momentId'] as String,
        content: json['content'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}

/// 附件指向的 blob 元数据（对齐 services/api 的 BlobEntry 公开字段）。
/// 与 Moment 解耦：isImage/isVideo/isAudio 按 mimeType 前缀判断，
/// 图片/视频/音频通用，后续新增文件类型只需扩展判断。
class MomentBlob {
  const MomentBlob({
    required this.id,
    required this.originalName,
    required this.mimeType,
    required this.size,
    this.width,
    this.height,
    this.duration,
    required this.fileUrl,
    required this.createdAt,
  });

  final String id;
  final String originalName;
  final String mimeType;
  final int size;
  final int? width;
  final int? height;

  /// 时长（毫秒），仅音视频有。
  final int? duration;

  /// 无签名直链（/api/blobs/:id/file），仅供回退；正常加载用签名链接。
  final String fileUrl;
  final String createdAt;

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');

  factory MomentBlob.fromJson(Map<String, dynamic> json) => MomentBlob(
        id: json['id'] as String,
        originalName: json['originalName'] as String? ?? '',
        mimeType: json['mimeType'] as String,
        size: (json['size'] as num?)?.toInt() ?? 0,
        width: (json['width'] as num?)?.toInt(),
        height: (json['height'] as num?)?.toInt(),
        duration: (json['duration'] as num?)?.toInt(),
        fileUrl: json['fileUrl'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// Moment 附件（对齐 services/api 的 MomentAttachmentEntry）。
class MomentAttachment {
  const MomentAttachment({
    required this.id,
    required this.blobId,
    required this.role,
    this.displayName,
    required this.sortOrder,
    required this.blob,
  });

  final String id;
  final String blobId;
  final String role;
  final String? displayName;
  final int sortOrder;
  final MomentBlob blob;

  bool get isImage => blob.isImage;
  bool get isVideo => blob.isVideo;
  bool get isAudio => blob.isAudio;

  String get displayLabel => displayName ?? blob.originalName;

  factory MomentAttachment.fromJson(Map<String, dynamic> json) =>
      MomentAttachment(
        id: json['id'] as String,
        blobId: json['blobId'] as String,
        role: json['role'] as String? ?? 'attachment',
        displayName: json['displayName'] as String?,
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
        blob: MomentBlob.fromJson(json['blob'] as Map<String, dynamic>),
      );
}

class Moment {
  const Moment({
    required this.id,
    required this.text,
    this.attachments = const [],
    required this.comments,
    required this.commentCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String text;
  final List<MomentAttachment> attachments;
  final List<MomentComment> comments;
  final int commentCount;
  final String createdAt;
  final String updatedAt;

  factory Moment.fromJson(Map<String, dynamic> json) => Moment(
        id: json['id'] as String,
        text: json['text'] as String,
        attachments: (json['attachments'] as List<dynamic>? ?? const [])
            .map((e) => MomentAttachment.fromJson(e as Map<String, dynamic>))
            .toList(),
        comments: (json['comments'] as List<dynamic>? ?? const [])
            .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
            .toList(),
        commentCount: json['commentCount'] as int? ?? 0,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
