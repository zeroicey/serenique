/// 审计日志级别（对齐后端 AUDIT_LEVELS：info | warn | error）。
enum AuditLevel {
  info('info', '信息'),
  warn('warn', '警告'),
  error('error', '错误');

  const AuditLevel(this.wire, this.label);

  /// 后端 wire 值（作为 query 参数 / 响应字段）。
  final String wire;

  /// 用户可见中文标签。
  final String label;

  /// 解析后端值；未知值兜底为 info（向前兼容）。
  static AuditLevel fromWire(Object? value) => AuditLevel.values.firstWhere(
        (l) => l.wire == value,
        orElse: () => AuditLevel.info,
      );
}

/// 服务端审计日志条目（`GET /api/audit/logs` 的一项）。
///
/// 对齐后端 `LogEntry`：id/event/message/level/source/ip/detail/isRead/createdAt。
class AuditLogEntry {
  const AuditLogEntry({
    required this.id,
    required this.event,
    required this.message,
    required this.level,
    required this.isRead,
    required this.createdAt,
    this.source,
    this.ip,
    this.detail,
  });

  final String id;

  /// 事件类型 key，如 `auth.login`。
  final String event;

  /// 人类可读中文消息（后端直接给中文）。
  final String message;

  final AuditLevel level;

  /// 来源端：web / cli / mobile / unknown（尽力而为，可能为空）。
  final String? source;

  /// 客户端 IP（登录类、401 事件必带）。
  final String? ip;

  /// 可扩展载荷（对齐后端 jsonb，不校验）。
  final Map<String, dynamic>? detail;

  /// 是否已读。
  final bool isRead;

  /// ISO 时间（后端为带时区时间戳）。
  final String createdAt;

  factory AuditLogEntry.fromJson(Map<String, dynamic> json) => AuditLogEntry(
        id: json['id'] as String,
        event: json['event'] as String? ?? '',
        message: json['message'] as String? ?? '',
        level: AuditLevel.fromWire(json['level']),
        source: json['source'] as String?,
        ip: json['ip'] as String?,
        detail: json['detail'] is Map<String, dynamic>
            ? json['detail'] as Map<String, dynamic>
            : null,
        isRead: json['isRead'] as bool? ?? false,
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// 日志分页结果 `{ items, total }`。
class AuditLogPage {
  const AuditLogPage({required this.items, required this.total});

  final List<AuditLogEntry> items;
  final int total;

  factory AuditLogPage.fromJson(Map<String, dynamic> json) => AuditLogPage(
        items: (json['items'] as List<dynamic>? ?? const [])
            .map((e) => AuditLogEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: json['total'] as int? ?? 0,
      );
}
