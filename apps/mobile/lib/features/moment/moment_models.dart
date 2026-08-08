class MomentComment {
  const MomentComment({
    required this.id,
    required this.momentId,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String momentId;
  final String content;
  final String createdAt;
  final String updatedAt;

  factory MomentComment.fromJson(Map<String, dynamic> json) => MomentComment(
        id: json['id'] as String,
        momentId: json['momentId'] as String,
        content: json['content'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}

class Moment {
  const Moment({
    required this.id,
    required this.text,
    required this.comments,
    required this.commentCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String text;
  final List<MomentComment> comments;
  final int commentCount;
  final String createdAt;
  final String updatedAt;

  factory Moment.fromJson(Map<String, dynamic> json) => Moment(
        id: json['id'] as String,
        text: json['text'] as String,
        comments: (json['comments'] as List<dynamic>? ?? const [])
            .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
            .toList(),
        commentCount: json['commentCount'] as int? ?? 0,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
