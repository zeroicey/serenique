/// 日程（Event）模块数据模型。时间字段保持 ISO 字符串（后端契约），
/// 展示前经 event_time.dart 的解析/格式化工具转本地时间。
class EventEntry {
  const EventEntry({
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.isAllDay,
    required this.createdAt,
    required this.updatedAt,
    this.location,
    this.note,
  });

  factory EventEntry.fromJson(Map<String, dynamic> json) => EventEntry(
        id: json['id'] as String,
        title: json['title'] as String,
        startAt: json['startAt'] as String,
        endAt: json['endAt'] as String,
        isAllDay: json['isAllDay'] as bool? ?? false,
        location: json['location'] as String?,
        note: json['note'] as String?,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );

  final String id;
  final String title;
  final String startAt;
  final String endAt;
  final bool isAllDay;
  final String? location;
  final String? note;
  final String createdAt;
  final String updatedAt;
}
