import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'blob_access.dart';
import 'blob_api.dart';
import 'blob_models.dart';
import '../../core/network/api_client.dart';

final blobApiProvider = Provider<BlobApi>(
  (ref) => BlobApi(ref.watch(apiClientProvider)),
);

/// 类型筛选（mimeType 前缀）：null = 全部，'image/'/'video/'/'audio/'。
/// 变化 → blobListProvider 重建 → 从第 1 页按新过滤条件拉取。
class BlobFilterNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? value) => state = value;
}

final blobFilterProvider = NotifierProvider<BlobFilterNotifier, String?>(
  BlobFilterNotifier.new,
);

/// 素材库列表（服务端状态 + 分页，≈ TanStack Query 的 query）。
/// 筛选条件变化 → notifier 重建 → 重新从第 1 页拉取（分页状态天然重置）。
class BlobListNotifier extends AsyncNotifier<BlobPage> {
  static const _pageSize = 48;

  /// 当前已加载到的页码（build 重建时重置回 1）。
  int _page = 1;

  /// 是否正在加载下一页（防滚动事件重复触发）。
  bool _fetching = false;

  @override
  Future<BlobPage> build() async {
    final mimeType = ref.watch(blobFilterProvider);
    _page = 1;
    final api = ref.watch(blobApiProvider);
    return api.list(page: 1, pageSize: _pageSize, mimeType: mimeType);
  }

  /// 滚动到底部附近时加载下一页，追加到已加载列表。
  /// 失败：保留已加载数据（页码不变），错误抛给页面提示。
  Future<void> loadMore() async {
    if (_fetching) return;
    final current = state.value;
    if (current == null || current.items.length >= current.total) return;
    // 捕获请求时的过滤条件：若期间用户切换了筛选，build 已重建，本次结果过期直接丢弃。
    final mimeType = ref.read(blobFilterProvider);
    final nextPage = _page + 1;
    _fetching = true;
    try {
      final next = await ref.read(blobApiProvider).list(
        page: nextPage,
        pageSize: _pageSize,
        mimeType: mimeType,
      );
      if (ref.read(blobFilterProvider) != mimeType) return;
      _page = nextPage;
      state = AsyncData(
        BlobPage(items: [...current.items, ...next.items], total: next.total),
      );
    } on Exception catch (e, st) {
      Error.throwWithStackTrace(e, st);
    } finally {
      _fetching = false;
    }
  }
}

final blobListProvider = AsyncNotifierProvider<BlobListNotifier, BlobPage>(
  BlobListNotifier.new,
);

/// 签名链接缓存服务：内存缓存 + 过期刷新 + 失败回退直链。
final blobAccessServiceProvider = Provider<BlobAccessService>((ref) {
  final api = ref.watch(blobApiProvider);
  final client = ref.watch(apiClientProvider);
  return BlobAccessService(
    fetchLink: (blobId) => api.createBlobAccessLink(blobId),
    directUrl: (blobId) => '${client.apiBase}/api/blobs/$blobId/file',
  );
});

/// 每个 blobId 的签名链接（FutureProvider.family keepAlive：瓦片销毁后
/// Future 结果仍缓存，回看时不重新 resolve；配合 BlobAccessService 的
/// URL 缓存，URL 稳定 → CachedNetworkImage 命中 → 不转圈重载）。
final blobAccessUrlProvider = FutureProvider.family<String, String>((
  ref,
  blobId,
) {
  return ref.watch(blobAccessServiceProvider).resolve(blobId);
});

/// 懒查某 blob 的业务引用（删除弹窗打开时 ref.read/invalidate）。
final blobAttachmentsProvider =
    FutureProvider.family<List<BlobAttachment>, String>((ref, blobId) {
  return ref.watch(blobApiProvider).listAttachments(blobId);
});

/// 素材库写操作集中在这里。删除成功后 invalidate 列表。
class BlobActions {
  BlobActions(this._ref);

  final Ref _ref;
  BlobApi get _api => _ref.read(blobApiProvider);

  /// 删除物理 blob。被引用时后端 409 → ApiException 由页面展示。
  Future<void> delete(String blobId) async {
    await _api.delete(blobId);
    _ref.invalidate(blobListProvider);
  }
}

final blobActionsProvider = Provider<BlobActions>((ref) => BlobActions(ref));