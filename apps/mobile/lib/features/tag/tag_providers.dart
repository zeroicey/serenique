import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../moment/moment_models.dart';
import '../moment/moment_providers.dart';
import 'tag_api.dart';

final tagApiProvider = Provider<TagApi>(
  (ref) => TagApi(ref.watch(apiClientProvider)),
);

/// 标签列表（服务端状态；写操作后 invalidate 刷新）。
final tagsProvider = FutureProvider<List<MomentTag>>(
  (ref) => ref.watch(tagApiProvider).list(),
);

/// 写操作集中处：成功后整体失效 tags / moments。
/// 标签改名/删除会影响闪记内嵌的 tags 显示，故同时 invalidate 闪记列表。
class TagActions {
  TagActions(this._ref);

  final Ref _ref;
  TagApi get _api => _ref.read(tagApiProvider);

  Future<MomentTag> create(String name) async {
    final t = await _api.create(name);
    _invalidate();
    return t;
  }

  Future<MomentTag> rename(String id, String name) async {
    final t = await _api.rename(id, name);
    _invalidate();
    return t;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _invalidate();
  }

  void _invalidate() {
    _ref.invalidate(tagsProvider);
    _ref.invalidate(momentListProvider);
  }
}

final tagActionsProvider = Provider<TagActions>((ref) => TagActions(ref));
