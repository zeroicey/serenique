import 'package:serenique_mobile/features/auth/token_storage.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

/// 测试用内存令牌存储。
class FakeTokenStorage implements TokenStorage {
  FakeTokenStorage([this.value]);

  String? value;
  int writes = 0;
  int deletes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
    writes++;
  }

  @override
  Future<void> delete() async {
    value = null;
    deletes++;
  }
}

/// 闪记列表的测试替身：无网络 IO，按搜索词/标签过滤 [all] 模拟服务端过滤。
/// build 里 watch 搜索词与标签过滤，变化 → notifier 重建 → 返回过滤后的列表
/// （与真实 MomentListNotifier 的「过滤条件变化重置第 1 页」行为一致）。
class FakeMomentListNotifier extends MomentListNotifier {
  FakeMomentListNotifier(this.all);

  final List<Moment> all;

  @override
  Future<MomentPage> build() async {
    final keyword = ref.watch(momentSearchKeywordProvider).trim();
    final tag = ref.watch(momentTagFilterProvider);
    var items = all;
    if (keyword.isNotEmpty) {
      items = items.where((m) => m.text.contains(keyword)).toList();
    }
    if (tag != null) {
      items = items.where((m) => m.tags.any((t) => t.id == tag)).toList();
    }
    return MomentPage(items: items, total: items.length);
  }
}
