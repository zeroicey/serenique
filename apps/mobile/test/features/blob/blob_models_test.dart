import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/blob/blob_models.dart';

void main() {
  group('BlobEntry.fromJson', () {
    test('解析完整字段（含 refCount）', () {
      final b = BlobEntry.fromJson({
        'id': 'b1',
        'originalName': 'a.png',
        'mimeType': 'image/png',
        'size': 1024,
        'checksum': 'abc123',
        'metadata': {'w': 1},
        'width': 800,
        'height': 600,
        'duration': null,
        'createdAt': '2026-08-05T00:00:00.000Z',
        'refCount': 3,
      });

      expect(b.id, 'b1');
      expect(b.originalName, 'a.png');
      expect(b.mimeType, 'image/png');
      expect(b.size, 1024);
      expect(b.width, 800);
      expect(b.height, 600);
      expect(b.refCount, 3);
      expect(b.isImage, isTrue);
      expect(b.isReferenced, isTrue);
    });

    test('缺失/未知字段容忍（默认值与类型判定）', () {
      final b = BlobEntry.fromJson({
        'id': 'b2',
        'mimeType': 'application/pdf',
      });

      expect(b.originalName, '');
      expect(b.size, 0);
      expect(b.refCount, 0);
      expect(b.isImage, isFalse);
      expect(b.isVideo, isFalse);
      expect(b.isAudio, isFalse);
      expect(b.isReferenced, isFalse);
      // 未知字段（如 fileUrl）不影响解析
    });

    test('mimeType 前缀判定', () {
      expect(BlobEntry.fromJson({'id': 'x', 'mimeType': 'video/mp4'}).isVideo, isTrue);
      expect(BlobEntry.fromJson({'id': 'x', 'mimeType': 'audio/mpeg'}).isAudio, isTrue);
    });
  });

  group('BlobAttachment.fromJson', () {
    test('解析引用字段', () {
      final a = BlobAttachment.fromJson({
        'id': 'a1',
        'blobId': 'b1',
        'ownerType': 'moment',
        'ownerId': 'm1',
        'role': 'attachment',
        'displayName': '封面',
        'sortOrder': 0,
        'createdAt': '2026-08-05T00:00:00.000Z',
        'updatedAt': '2026-08-05T00:00:00.000Z',
      });

      expect(a.ownerType, 'moment');
      expect(a.ownerId, 'm1');
      expect(a.displayName, '封面');
    });

    test('displayName 可空、sortOrder 默认 0', () {
      final a = BlobAttachment.fromJson({
        'id': 'a2',
        'blobId': 'b1',
        'ownerType': 'diary',
        'ownerId': 'd1',
      });

      expect(a.displayName, isNull);
      expect(a.sortOrder, 0);
      expect(a.role, 'attachment');
    });
  });
}