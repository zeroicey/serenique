class DiaryEntry {
  const DiaryEntry({
    required this.id,
    required this.diaryDate,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String diaryDate; // YYYY-MM-DD
  final String content;
  final String createdAt;
  final String updatedAt;

  factory DiaryEntry.fromJson(Map<String, dynamic> json) => DiaryEntry(
        id: json['id'] as String,
        diaryDate: json['diaryDate'] as String,
        content: json['content'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
