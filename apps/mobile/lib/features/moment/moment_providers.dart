import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
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
