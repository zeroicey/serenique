import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'audit_api.dart';
import 'audit_models.dart';

final auditApiProvider =
    Provider<AuditApi>((ref) => AuditApi(ref.watch(apiClientProvider)));

/// 日志页筛选条件。
class AuditFilter {
  const AuditFilter({this.level, this.unreadOnly = false});

  /// 级别过滤；null = 全部。
  final String? level;

  /// 只看未读。
  final bool unreadOnly;
}

class AuditFilterNotifier extends Notifier<AuditFilter> {
  @override
  AuditFilter build() => const AuditFilter();

  void setLevel(String? level) =>
      state = AuditFilter(level: level, unreadOnly: state.unreadOnly);

  void setUnreadOnly(bool unreadOnly) =>
      state = AuditFilter(level: state.level, unreadOnly: unreadOnly);
}

final auditFilterProvider =
    NotifierProvider<AuditFilterNotifier, AuditFilter>(AuditFilterNotifier.new);

/// 日志列表（服务端状态，≈ TanStack Query 的 query）。筛选变化时自动重拉。
final auditListProvider = FutureProvider<AuditLogPage>((ref) {
  final filter = ref.watch(auditFilterProvider);
  return ref.watch(auditApiProvider).list(
        pageSize: 50,
        level: filter.level,
        unreadOnly: filter.unreadOnly,
      );
});

/// 未读日志数。
final auditUnreadCountProvider = FutureProvider<int>((ref) {
  return ref.watch(auditApiProvider).unreadCount();
});

/// 写操作集中在这里：调用 API 成功后 invalidate 列表/未读数（≈ invalidateQueries）。
class AuditActions {
  AuditActions(this._ref);

  final Ref _ref;
  AuditApi get _api => _ref.read(auditApiProvider);

  /// 全部置已读，并刷新列表与未读数。
  Future<({int updatedCount, int unreadCount})> markAllRead() async {
    final result = await _api.markRead();
    _ref.invalidate(auditListProvider);
    _ref.invalidate(auditUnreadCountProvider);
    return result;
  }
}

final auditActionsProvider =
    Provider<AuditActions>((ref) => AuditActions(ref));
