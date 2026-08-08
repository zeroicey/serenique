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

  test('Moment.fromJson 解析内嵌 attachments', () {
    final m = Moment.fromJson({
      'id': 'm1',
      'text': '有附件的闪记',
      'attachments': [
        {
          'id': 'a1',
          'blobId': 'b1',
          'role': 'attachment',
          'displayName': '照片.jpg',
          'sortOrder': 0,
          'blob': {
            'id': 'b1',
            'originalName': '照片.jpg',
            'mimeType': 'image/jpeg',
            'size': 1024,
            'width': 100,
            'height': 200,
            'duration': null,
            'fileUrl': '/api/blobs/b1/file',
            'createdAt': 't',
          },
        },
        {
          'id': 'a2',
          'blobId': 'b2',
          'role': 'attachment',
          'sortOrder': 1,
          'blob': {
            'id': 'b2',
            'originalName': '视频.mp4',
            'mimeType': 'video/mp4',
            'size': 2048,
            'duration': 65000,
            'fileUrl': '/api/blobs/b2/file',
            'createdAt': 't',
          },
        },
      ],
      'comments': <Object>[],
      'commentCount': 0,
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(m.attachments, hasLength(2));
    final image = m.attachments[0];
    expect(image.isImage, isTrue);
    expect(image.isVideo, isFalse);
    expect(image.displayLabel, '照片.jpg');
    expect(image.blob.width, 100);
    expect(image.blob.height, 200);
    final video = m.attachments[1];
    expect(video.isVideo, isTrue);
    expect(video.isAudio, isFalse);
    expect(video.displayLabel, '视频.mp4');
    expect(video.blob.duration, 65000);
  });

  test('Moment.fromJson 缺 attachments 时默认为空', () {
    final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
    expect(m.attachments, isEmpty);
  });
}
