import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'blob_access.dart';
import 'moment_models.dart';

/// r2 直传凭据（POST /api/blobs/upload-url 响应）。
class UploadUrl {
  UploadUrl({
    required this.blobId,
    required this.storagePath,
    required this.url,
  });

  final String blobId;
  final String storagePath;
  final String url;

  factory UploadUrl.fromJson(Map<String, dynamic> json) => UploadUrl(
    blobId: json['blobId'] as String,
    storagePath: json['storagePath'] as String,
    url: json['url'] as String,
  );
}

/// moment 的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
class MomentApi {
  MomentApi(this._client);

  final ApiClient _client;

  /// 列表（一页的 items，总数用 [listPage] 拿）。
  /// [tag] 非空则按标签过滤（GET /api/moments?tag=）。
  Future<List<Moment>> list({
    int page = 1,
    int pageSize = 50,
    String? query,
    String? tag,
  }) async {
    return (await listPage(
      page: page,
      pageSize: pageSize,
      query: query,
      tag: tag,
    )).items;
  }

  /// 分页列表：条目 + 服务端 total。
  /// [query] 非空才拼 `q` 参数（对齐 Web：空白关键词 = 全量列表）；
  /// [tag] 非空才拼 `tag` 参数（标签过滤，与 q additive）。
  Future<MomentPage> listPage({
    int page = 1,
    int pageSize = 50,
    String? query,
    String? tag,
  }) async {
    final data = await _client.getData(
      '/api/moments',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
        if (tag != null && tag.isNotEmpty) 'tag': tag,
      },
    );
    final map = data as Map<String, dynamic>;
    return MomentPage(
      items: (map['items'] as List<dynamic>? ?? const [])
          .map((e) => Moment.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (map['total'] as num?)?.toInt() ?? 0,
    );
  }

  /// 轻量取总数：只拉一页 pageSize=1，读响应里的 total。
  Future<int> count() async {
    final data = await _client.getData(
      '/api/moments',
      query: {'page': 1, 'pageSize': 1},
    );
    return (data as Map<String, dynamic>)['total'] as int;
  }

  Future<Moment> get(String id) async {
    final data = await _client.getData('/api/moments/$id');
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  /// 上传二进制：r2 后端走两步直传（签发 PUT 凭据 → 直连 s3.0icey.icu PUT → confirm）；
  /// local 后端（dev/回滚）upload-url 返回 400 → 回退 multipart。
  Future<MomentBlob> uploadBlob(
    Uint8List bytes, {
    required String filename,
    required String mimeType,
  }) async {
    // 1) 签发直传凭据（仅 r2 后端可用）
    UploadUrl cred;
    try {
      final data = await _client.postData(
        '/api/blobs/upload-url',
        body: {
          'filename': filename,
          'mimeType': mimeType,
          'size': bytes.length,
        },
      );
      cred = UploadUrl.fromJson(data as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.statusCode == 400) {
        // local 后端：回退 multipart 上传
        final data = await _client.postMultipart(
          '/api/blobs/upload',
          bytes: bytes,
          filename: filename,
          mimeType: mimeType,
        );
        return MomentBlob.fromJson(data as Map<String, dynamic>);
      }
      rethrow;
    }

    // 2) 直传 PUT（Worker 校验写 R2）
    final status = await _client.putBinary(cred.url, bytes, mimeType);
    if (status < 200 || status >= 300) {
      throw ApiException(
        'UPLOAD_FAILED',
        '文件直传失败（$status），请重试',
        statusCode: status,
      );
    }

    // 3) SHA-256 + confirm（去重 + 落库）
    final checksum = sha256.convert(bytes).toString();
    final data = await _client.postData(
      '/api/blobs/confirm',
      body: {
        'blobId': cred.blobId,
        'storagePath': cred.storagePath,
        'originalName': filename,
        'mimeType': mimeType,
        'size': bytes.length,
        'checksum': checksum,
      },
    );
    return MomentBlob.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> create(
    String text, {
    List<MomentAttachmentInput> attachments = const [],
    MomentLocation? location,
    List<String> tags = const [],
  }) async {
    final data = await _client.postData(
      '/api/moments',
      body: {
        'text': text,
        if (attachments.isNotEmpty)
          'attachments': attachments.map((a) => a.toJson()).toList(),
        // 后端 Create 不接受 null：location == null 时不带该字段
        if (location != null) 'location': location.toJson(),
        // 内联标签：只接受已存在的 tagId（不存在 → 404），tags 为空时不带
        if (tags.isNotEmpty) 'tags': tags,
      },
    );
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> update(String id, String text) async {
    final data = await _client.putData(
      '/api/moments/$id',
      body: {'text': text},
    );
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _client.deleteData('/api/moments/$id');
  }

  /// 整体替换闪记标签（PUT /api/moments/:id/tags body {tagIds}）。
  /// 幂等集合语义：容忍已绑定、空数组清空全部、不存在的 tagId → 404 整体回滚。
  /// 返回替换后的新 tags（列表接口与详情接口字段形状一致）。
  Future<List<MomentTag>> replaceMomentTags(
    String momentId,
    List<String> tagIds,
  ) async {
    final data = await _client.putData(
      '/api/moments/$momentId/tags',
      body: {'tagIds': tagIds},
    );
    return (data as List<dynamic>)
        .map((e) => MomentTag.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MomentComment>> listComments(String momentId) async {
    final data = await _client.getData('/api/moments/$momentId/comments');
    return (data as List<dynamic>)
        .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MomentComment> addComment(String momentId, String content) async {
    final data = await _client.postData(
      '/api/moments/$momentId/comments',
      body: {'content': content},
    );
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<MomentComment> updateComment(
    String momentId,
    String commentId,
    String content,
  ) async {
    final data = await _client.putData(
      '/api/moments/$momentId/comments/$commentId',
      body: {'content': content},
    );
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteComment(String momentId, String commentId) async {
    await _client.deleteData('/api/moments/$momentId/comments/$commentId');
  }

  /// 申请 blob 签名访问链接，返回完整 URL 与过期时间。
  /// R2 直链（生产）：后端返回的 `path` 已是 s3.0icey.icu 绝对 URL，直接使用；
  /// 未迁移/开发环境回退 API 代理链接（相对 path + 客户端 apiBase 拼接）。
  /// 对齐 Web `resolveApiPath`：绝对 URL 原样返回，相对 path 才拼 apiBase。
  Future<BlobAccessLink> createBlobAccessLink(String blobId) async {
    final data = await _client.postData(
      '/api/blobs/$blobId/access-link',
      body: {'expiresInSeconds': 3600},
    );
    final path = data['path'] as String;
    final expires = (data['expires'] as num).toInt();
    final url = path.startsWith('http') ? path : '$_apiBase$path';
    return BlobAccessLink(
      url: url,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(expires * 1000),
    );
  }

  String get _apiBase => _client.apiBase;
}
