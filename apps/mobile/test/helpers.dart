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

/// 闪记列表的测试替身：无网络 IO，按搜索词过滤 [all] 模拟服务端搜索。
/// build 里 watch 搜索词，关键词变化 → notifier 重建 → 返回过滤后的列表
/// （与真实 MomentListNotifier 的「搜索词变化重置第 1 页」行为一致）。
class FakeMomentListNotifier extends MomentListNotifier {
  FakeMomentListNotifier(this.all);

  final List<Moment> all;

  @override
  Future<MomentPage> build() async {
    final keyword = ref.watch(momentSearchKeywordProvider).trim();
    final items = keyword.isEmpty
        ? all
        : all.where((m) => m.text.contains(keyword)).toList();
    return MomentPage(items: items, total: items.length);
  }
}
