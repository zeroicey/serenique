import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'blob_access.dart';
import 'moment_api.dart';
import 'moment_models.dart';

final momentApiProvider =
    Provider<MomentApi>((ref) => MomentApi(ref.watch(apiClientProvider)));

/// 闪记列表（服务端状态，≈ TanStack Query 的 query）。
final momentListProvider = FutureProvider<List<Moment>>((ref) async {
  return ref.watch(momentApiProvider).list();
});

/// 闪记详情（含评论）。
final momentDetailProvider =
    FutureProvider.family<Moment, String>((ref, id) async {
  return ref.watch(momentApiProvider).get(id);
});

/// 写操作集中在这里：调用 API 成功后 invalidate 对应列表/详情（≈ invalidateQueries）。
class MomentActions {
  MomentActions(this._ref);

  final Ref _ref;
  MomentApi get _api => _ref.read(momentApiProvider);

  Future<Moment> create(String text) async {
    final created = await _api.create(text);
    _ref.invalidate(momentListProvider);
    return created;
  }

  /// 上传编排：逐个 uploadBlob → createMoment（对齐 Web useCreateMomentWithMedia）。
  /// 任一步失败抛错，由页面保留已选附件供重试。
  Future<Moment> createWithMedia(
    String text,
    List<({Uint8List bytes, String filename, String mimeType})> files,
  ) async {
    final blobs = <String>[];
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final blob =
          await _api.uploadBlob(f.bytes, filename: f.filename, mimeType: f.mimeType);
      blobs.add(blob.id);
    }
    final created = await _api.create(
      text,
      attachments: [
        for (var i = 0; i < blobs.length; i++)
          MomentAttachmentInput(
              blobId: blobs[i], displayName: files[i].filename, sortOrder: i),
      ],
    );
    _ref.invalidate(momentListProvider);
    return created;
  }

  Future<Moment> update(String id, String text) async {
    final updated = await _api.update(id, text);
    _ref.invalidate(momentDetailProvider(id));
    _ref.invalidate(momentListProvider);
    return updated;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _ref.invalidate(momentListProvider);
  }

  Future<MomentComment> addComment(String momentId, String content) async {
    final comment = await _api.addComment(momentId, content);
    _ref.invalidate(momentDetailProvider(momentId));
    _ref.invalidate(momentListProvider);
    return comment;
  }

  Future<void> deleteComment(String momentId, String commentId) async {
    await _api.deleteComment(momentId, commentId);
    _ref.invalidate(momentDetailProvider(momentId));
    _ref.invalidate(momentListProvider); // 列表也展示 commentCount，删除评论后需同步
  }
}

final momentActionsProvider =
    Provider<MomentActions>((ref) => MomentActions(ref));

/// 已选附件（未上传）的本地状态：编辑页展示缩略图、提交后清空。
class PickedAttachments extends Notifier<List<PickedAttachment>> {
  PickedAttachments({List<PickedAttachment>? initial})
      : _initial = initial ?? const [];

  final List<PickedAttachment> _initial;
  @override
  List<PickedAttachment> build() => _initial;

  void set(List<PickedAttachment> value) => state = value;
  void addAll(List<PickedAttachment> value) => state = [...state, ...value];
  void removeAt(int index) => state = [...state]..removeAt(index);
  void clear() => state = const [];
}

final pickedAttachmentsProvider =
    NotifierProvider<PickedAttachments, List<PickedAttachment>>(
        PickedAttachments.new);

/// 签名链接缓存服务：内存缓存 + 过期刷新 + 失败回退直链。
final blobAccessServiceProvider = Provider<BlobAccessService>((ref) {
  final api = ref.watch(momentApiProvider);
  final client = ref.watch(apiClientProvider);
  return BlobAccessService(
    fetchLink: (blobId) => api.createBlobAccessLink(blobId),
    directUrl: (blobId) => '${client.apiBase}/api/blobs/$blobId/file',
  );
});

/// 每个 blobId 的签名链接（autoDispose：瓦片离开屏幕时释放；
/// 命中 service 内存缓存则不发请求）。
final blobAccessUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, blobId) {
  return ref.watch(blobAccessServiceProvider).resolve(blobId);
});
