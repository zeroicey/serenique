class TaskEntry {
  const TaskEntry({
    required this.id,
    required this.groupId,
    required this.title,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.completedAt,
    this.dueDate,
  });

  final String id;
  final String groupId;
  final String title;
  final String status; // todo / done / abandon
  final String createdAt;
  final String updatedAt;
  final String? completedAt;
  final String? dueDate; // YYYY-MM-DD

  factory TaskEntry.fromJson(Map<String, dynamic> json) => TaskEntry(
        id: json['id'] as String,
        groupId: json['groupId'] as String,
        title: json['title'] as String,
        status: json['status'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
        completedAt: json['completedAt'] as String?,
        dueDate: json['dueDate'] as String?,
      );
}

class TaskGroupEntry {
  const TaskGroupEntry({required this.id, required this.title, required this.createdAt, required this.updatedAt});
  final String id;
  final String title;
  final String createdAt;
  final String updatedAt;

  factory TaskGroupEntry.fromJson(Map<String, dynamic> json) => TaskGroupEntry(
        id: json['id'] as String,
        title: json['title'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
