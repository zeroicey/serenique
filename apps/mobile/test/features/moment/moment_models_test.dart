import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

void main() {
  test('Moment.fromJson 解析字段 + 内嵌评论', () {
    final m = Moment.fromJson({
      'id': 'm1',
      'text': '今天天气不错',
      'attachments': <Object>[],
      'comments': [
        {'id': 'c1', 'momentId': 'm1', 'content': '同意', 'createdAt': 't', 'updatedAt': 't'},
      ],
      'commentCount': 1,
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(m.id, 'm1');
    expect(m.text, '今天天气不错');
    expect(m.comments.single.content, '同意');
    expect(m.commentCount, 1);
  });

  test('Moment.fromJson 缺 comments 时默认为空', () {
    final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
    expect(m.comments, isEmpty);
    expect(m.commentCount, 0);
  });

  Map<String, Object?> blobJson({
    required String id,
    String mimeType = 'image/jpeg',
    int? width,
    int? height,
    int? duration,
  }) =>
      {
        'id': id,
        'originalName': '$id.jpg',
        'mimeType': mimeType,
        'size': 1024,
        'width': width,
        'height': height,
        'duration': duration,
        'fileUrl': '/api/blobs/$id/file',
        'createdAt': 't',
      };

  test('Moment.fromJson 解析 attachments 内嵌 blob', () {
    final m = Moment.fromJson({
      'id': 'm1',
      'text': '看照片',
      'attachments': [
        {
          'id': 'a1',
          'blobId': 'b1',
          'role': 'attachment',
          'displayName': 'photo.jpg',
          'sortOrder': 0,
          'blob': blobJson(id: 'b1', width: 1200, height: 800),
        },
      ],
      'createdAt': 't',
      'updatedAt': 't',
    });

    final a = m.attachments.single;
    expect(a.id, 'a1');
    expect(a.blobId, 'b1');
    expect(a.role, 'attachment');
    expect(a.displayName, 'photo.jpg');
    expect(a.sortOrder, 0);
    expect(a.displayLabel, 'photo.jpg');
    expect(a.blob.mimeType, 'image/jpeg');
    expect(a.blob.width, 1200);
    expect(a.blob.height, 800);
    expect(a.isImage, isTrue);
    expect(a.isVideo, isFalse);
    expect(a.isAudio, isFalse);
  });

  test('Moment.fromJson 缺 attachments 时默认为空', () {
    final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
    expect(m.attachments, isEmpty);
  });

  test('mimeType 分类：image/video/audio 与 displayName 回退', () {
    final image = MomentAttachment.fromJson({
      'id': 'a1', 'blobId': 'b1', 'sortOrder': 0,
      'blob': blobJson(id: 'b1', mimeType: 'image/png'),
    });
    final video = MomentAttachment.fromJson({
      'id': 'a2', 'blobId': 'b2', 'sortOrder': 1,
      'blob': blobJson(id: 'b2', mimeType: 'video/mp4', duration: 15000),
    });
    final audio = MomentAttachment.fromJson({
      'id': 'a3', 'blobId': 'b3', 'sortOrder': 2,
      'blob': blobJson(id: 'b3', mimeType: 'audio/mpeg'),
    });
    final noName = MomentAttachment.fromJson({
      'id': 'a4', 'blobId': 'b4', 'sortOrder': 3,
      'blob': blobJson(id: 'b4', mimeType: 'application/pdf'),
    });

    expect(image.isImage, isTrue);
    expect(video.isVideo, isTrue);
    expect(video.blob.duration, 15000);
    expect(audio.isAudio, isTrue);
    expect(noName.isImage, isFalse);
    expect(noName.isVideo, isFalse);
    expect(noName.isAudio, isFalse);
    // displayName 缺省时回退到 originalName
    expect(image.displayLabel, 'b1.jpg');
  });
}
