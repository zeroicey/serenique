import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'blob_access.dart';
import 'moment_api.dart';
import 'moment_models.dart';
import '../tag/tag_providers.dart';

final momentApiProvider = Provider<MomentApi>(
  (ref) => MomentApi(ref.watch(apiClientProvider)),
);

/// 搜索关键词（已输入、经防抖后的实际搜索词；空 = 全量列表）。
class MomentSearchKeywordNotifier extends Notifier<String> {
  @override
  String build() => '';

  void set(String value) => state = value;
}

final momentSearchKeywordProvider =
    NotifierProvider<MomentSearchKeywordNotifier, String>(
      MomentSearchKeywordNotifier.new,
    );

/// 当前按标签过滤的 tagId（null = 全部列表）。
/// 由标签管理页/卡片标签点击写入；变化 → 列表 notifier 重建 → 重新从第 1 页按标签拉取。
class MomentTagFilterNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? value) => state = value;
}

final momentTagFilterProvider =
    NotifierProvider<MomentTagFilterNotifier, String?>(
      MomentTagFilterNotifier.new,
    );

/// 闪记列表（服务端状态 + 分页，≈ TanStack Query 的 query）。
/// 搜索词变化 → notifier 重建 → 重新从第 1 页拉取（分页状态天然重置）。
class MomentListNotifier extends AsyncNotifier<MomentPage> {
  static const _pageSize = 50;

  /// 当前已加载到的页码（build 重建时重置回 1）。
  int _page = 1;

  /// 是否正在加载下一页（防滚动事件重复触发）。
  bool _fetching = false;

  @override
  Future<MomentPage> build() async {
    final keyword = ref.watch(momentSearchKeywordProvider);
    final tag = ref.watch(momentTagFilterProvider);
    _page = 1;
    return ref.watch(momentApiProvider).listPage(query: keyword, tag: tag);
  }

  /// 滚动到底部附近时加载下一页，追加到已加载列表。
  /// 失败：保留已加载数据（页码不变），错误抛给页面提示。
  Future<void> loadMore() async {
    if (_fetching) return;
    final current = state.value;
    if (current == null || current.items.length >= current.total) return;
    // 捕获请求时的关键词与标签：若期间用户改了搜索词或过滤标签，build 已重建，
    // 本次结果过期，直接丢弃（不污染新过滤条件下的结果）。
    final keyword = ref.read(momentSearchKeywordProvider);
    final tag = ref.read(momentTagFilterProvider);
    final nextPage = _page + 1;
    _fetching = true;
    try {
      final next = await ref
          .read(momentApiProvider)
          .listPage(
            page: nextPage,
            pageSize: _pageSize,
            query: keyword,
            tag: tag,
          );
      if (ref.read(momentSearchKeywordProvider) != keyword ||
          ref.read(momentTagFilterProvider) != tag) {
        return;
      }
      _page = nextPage;
      state = AsyncData(
        MomentPage(items: [...current.items, ...next.items], total: next.total),
      );
    } on Exception catch (e, st) {
      Error.throwWithStackTrace(e, st);
    } finally {
      _fetching = false;
    }
  }
}

final momentListProvider =
    AsyncNotifierProvider<MomentListNotifier, MomentPage>(
      MomentListNotifier.new,
    );

/// 闪记详情（含评论）。
final momentDetailProvider = FutureProvider.family<Moment, String>((
  ref,
  id,
) async {
  return ref.watch(momentApiProvider).get(id);
});

/// 写操作集中在这里：调用 API 成功后 invalidate 对应列表/详情（≈ invalidateQueries）。
class MomentActions {
  MomentActions(this._ref);

  final Ref _ref;
  MomentApi get _api => _ref.read(momentApiProvider);

  Future<Moment> create(
    String text, {
    MomentLocation? location,
    List<String> tags = const [],
  }) async {
    final created = await _api.create(text, location: location, tags: tags);
    _ref.invalidate(momentListProvider);
    return created;
  }

  /// 上传编排：逐个 uploadBlob → createMoment（对齐 Web useCreateMomentWithMedia）。
  /// 任一步失败抛错，由页面保留已选附件供重试。
  Future<Moment> createWithMedia(
    String text,
    List<({Uint8List bytes, String filename, String mimeType})> files, {
    MomentLocation? location,
    List<String> tags = const [],
  }) async {
    final blobs = <String>[];
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final blob = await _api.uploadBlob(
        f.bytes,
        filename: f.filename,
        mimeType: f.mimeType,
      );
      blobs.add(blob.id);
    }
    final created = await _api.create(
      text,
      attachments: [
        for (var i = 0; i < blobs.length; i++)
          MomentAttachmentInput(
            blobId: blobs[i],
            displayName: files[i].filename,
            sortOrder: i,
          ),
      ],
      location: location,
      tags: tags,
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

  /// 整体替换闪记标签（PUT 幂等集合语义）。
  /// 成功后失效详情 / 列表（内嵌 tags 变化）与标签列表（momentCount 变化）。
  Future<List<MomentTag>> replaceTags(
    String momentId,
    List<String> tagIds,
  ) async {
    final tags = await _api.replaceMomentTags(momentId, tagIds);
    _ref.invalidate(momentDetailProvider(momentId));
    _ref.invalidate(momentListProvider);
    _ref.invalidate(tagsProvider);
    return tags;
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

final momentActionsProvider = Provider<MomentActions>(
  (ref) => MomentActions(ref),
);

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
      PickedAttachments.new,
    );

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
/// 签名直链 Future（按 blobId）。keepAlive（非 autoDispose）：滚动列表项销毁后
/// Future 结果仍缓存，回看时不重新 resolve（配合 BlobAccessService 的 URL 缓存，
/// URL 稳定 → ImageCache/CachedNetworkImage 命中 → 不再转圈重载）。
final blobAccessUrlProvider = FutureProvider.family<String, String>((ref, blobId) {
  return ref.watch(blobAccessServiceProvider).resolve(blobId);
});
