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

  group('MomentLocation', () {
    test('fromJson 解析全字段', () {
      final loc = MomentLocation.fromJson(
          {'name': '星巴克', 'latitude': 39.9827, 'longitude': 116.3162});
      expect(loc.name, '星巴克');
      expect(loc.latitude, 39.9827);
      expect(loc.longitude, 116.3162);
      expect(loc.hasCoordinates, isTrue);
    });

    test('fromJson 容忍缺省/部分字段（仅 name）', () {
      final loc = MomentLocation.fromJson({'name': '未命名地点'});
      expect(loc.name, '未命名地点');
      expect(loc.latitude, isNull);
      expect(loc.longitude, isNull);
      expect(loc.hasCoordinates, isFalse);
    });

    test('fromJson 容忍部分坐标字段（仅经纬之一）', () {
      final loc = MomentLocation.fromJson({'latitude': 39.9});
      expect(loc.latitude, 39.9);
      expect(loc.longitude, isNull);
      expect(loc.hasCoordinates, isFalse);
    });

    test('toJson 只带非空字段（创建请求体对齐后端 Schema）', () {
      expect(
        const MomentLocation(name: 'A', latitude: 39.9, longitude: 116.4)
            .toJson(),
        {'name': 'A', 'latitude': 39.9, 'longitude': 116.4},
      );
      expect(const MomentLocation(latitude: 39.9).toJson(), {'latitude': 39.9});
      expect(const MomentLocation().toJson(), isEmpty);
    });

    test('相等性比较', () {
      const a = MomentLocation(name: 'A', latitude: 39.9);
      expect(a, const MomentLocation(name: 'A', latitude: 39.9));
      expect(a == const MomentLocation(name: 'A', latitude: 39.91), isFalse);
      expect(a.hashCode,
          const MomentLocation(name: 'A', latitude: 39.9).hashCode);
    });
  });

  group('Moment.location', () {
    Moment withLocation(Object? location) => Moment.fromJson({
          'id': 'm1',
          'text': 'x',
          'location': location,
          'createdAt': 't',
          'updatedAt': 't',
        });

    test('location 对象被解析', () {
      final m = withLocation({'name': '公园', 'latitude': 39.9, 'longitude': 116.4});
      expect(m.location, isNotNull);
      expect(m.location!.name, '公园');
      expect(m.location!.hasCoordinates, isTrue);
    });

    test('location 为 null / 缺省 → null（不抛错）', () {
      expect(withLocation(null).location, isNull);
      expect(
        Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'})
            .location,
        isNull,
      );
    });
  });
}
