import 'dart:typed_data';

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
    this.createdAt = '',
    required this.blob,
  });

  final String id;
  final String blobId;
  final String role;
  final String? displayName;
  final int sortOrder;

  /// ISO 时间串，仅用于与 API 一致的附件排序；无值时排最前（'' < 任何值）。
  final String createdAt;
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
        createdAt: json['createdAt'] as String? ?? '',
        blob: MomentBlob.fromJson(json['blob'] as Map<String, dynamic>),
      );
}

/// 创建 Moment 时的附件输入（对齐 services/api MomentAttachmentInputSchema）。
class MomentAttachmentInput {
  const MomentAttachmentInput({
    required this.blobId,
    this.displayName,
    required this.sortOrder,
  });

  final String blobId;
  final String? displayName;
  final int sortOrder;

  Map<String, dynamic> toJson() => {
        'blobId': blobId,
        if (displayName != null) 'displayName': displayName,
        'sortOrder': sortOrder,
      };
}

/// 与 API 同款比较器 (sortOrder, createdAt, id) 稳定排序，返回新列表、不改原列表。
/// 网格与全屏预览必须共用本函数的结果，保证「网格第 i 格 == 预览 initialIndex=i」。
List<MomentAttachment> sortedAttachments(List<MomentAttachment> attachments) {
  return [...attachments]..sort((a, b) {
      final order = a.sortOrder.compareTo(b.sortOrder);
      if (order != 0) return order;
      final created = a.createdAt.compareTo(b.createdAt);
      if (created != 0) return created;
      return a.id.compareTo(b.id);
    });
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

/// 已选附件：bytes 供上传，localPath 供本地缩略图预览。
class PickedAttachment {
  const PickedAttachment({
    required this.bytes,
    required this.filename,
    required this.mimeType,
    this.localPath,
    this.durationMs,
  });

  final Uint8List bytes;
  final String filename;
  final String mimeType;

  /// 本地文件路径（image_picker/file_picker 返回的临时路径），供缩略图直接显示。
  final String? localPath;

  /// 时长（毫秒），仅音视频有。
  final int? durationMs;

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');
}
