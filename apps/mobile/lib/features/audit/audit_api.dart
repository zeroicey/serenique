import '../../../core/network/api_client.dart';
import 'audit_models.dart';

/// audit 服务端日志的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
///
/// 契约（后端按 `.ai/requirements/2026-08-08-audit-module.md` §6）：
/// - GET  `/api/audit/logs` → `{ items, total }`（支持 page/pageSize/level/event/unreadOnly）
/// - GET  `/api/audit/logs/unread-count` → `{ unreadCount }`
/// - PUT  `/api/audit/logs/read` → `{ updatedCount, unreadCount }`（body `{ ids }`，空 = 全部置已读）
/// 只读，无删除接口。
class AuditApi {
  AuditApi(this._client);

  final ApiClient _client;

  /// 日志列表，`created_at DESC`。
  ///
  /// `level` / `event` 为可选过滤；`unreadOnly` 仅传 true（后端对
  /// `?unreadOnly=false` 有 coerce 陷阱，传 false 反而会被解析成 true，
  /// 所以 false 时不带该参数，交由后端默认「全部」）。
  Future<AuditLogPage> list({
    int page = 1,
    int pageSize = 50,
    String? level,
    String? event,
    bool unreadOnly = false,
  }) async {
    final data = await _client.getData(
      '/api/audit/logs',
      query: {
        'page': page,
        'pageSize': pageSize,
        'level': ?level,
        'event': ?event,
        if (unreadOnly) 'unreadOnly': 'true',
      },
    );
    return AuditLogPage.fromJson(data as Map<String, dynamic>);
  }

  /// 未读日志条数。
  Future<int> unreadCount() async {
    final data = await _client.getData('/api/audit/logs/unread-count');
    return (data as Map<String, dynamic>)['unreadCount'] as int? ?? 0;
  }

  /// 标记已读。`ids` 缺省或为空 = 全部置已读（后端空数组视为未提供）。
  Future<({int updatedCount, int unreadCount})> markRead({
    List<String>? ids,
  }) async {
    final body =
        (ids == null || ids.isEmpty) ? const <String, dynamic>{} : {'ids': ids};
    final data = await _client.putData('/api/audit/logs/read', body: body);
    final map = data as Map<String, dynamic>;
    return (
      updatedCount: map['updatedCount'] as int? ?? 0,
      unreadCount: map['unreadCount'] as int? ?? 0,
    );
  }
}
