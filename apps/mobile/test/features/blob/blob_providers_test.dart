import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/blob/blob_api.dart';
import 'package:serenique_mobile/features/blob/blob_providers.dart';

/// 假 ApiClient：deleteData 返回预置 data；记录 deleteUrl 网关直删调用。
class _RecordingApiClient extends ApiClient {
  _RecordingApiClient({required this.deleteDataResult})
      : super(baseUrl: 'http://x', tokenReader: () => null);

  /// DELETE /api/blobs/:id 的 unwrap 后 data（null = 204 local 模式）。
  final Future<Object?> Function() deleteDataResult;

  final List<String> deleteUrlCalls = [];

  @override
  Future<dynamic> deleteData(String path) => deleteDataResult();

  @override
  Future<int> deleteUrl(String absoluteUrl) async {
    deleteUrlCalls.add(absoluteUrl);
    return 200;
  }
}

void main() {
  BlobApi apiWith(_RecordingApiClient client) => BlobApi(client);

  BlobActions actionsWith(ProviderContainer container) =>
      container.read(blobActionsProvider);

  ProviderContainer containerWith(_RecordingApiClient client) {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(client),
        blobApiProvider.overrideWithValue(apiWith(client)),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  group('BlobActions.delete — r2 deleteUrls 直发网关', () {
    test('官方 origin 的 deleteUrl 全部直发，非官方被过滤（fire-and-forget）', () async {
      const official =
          'https://s3.0icey.icu/image/2026/08/b1.png?e=1&s=abc';
      const thumb =
          'https://s3.0icey.icu/image/2026/08/b1.png.thumb.webp?e=1&s=def';
      const evil = 'https://evil.example/path';
      final client = _RecordingApiClient(
        deleteDataResult: () async => {
          'deleted': true,
          'deleteUrls': [official, evil, thumb],
        },
      );
      final container = containerWith(client);

      await actionsWith(container).delete('b1');

      expect(client.deleteUrlCalls, [official, thumb]);
    });

    test('local 204（空 deleteUrls）不发任何网关请求', () async {
      final client = _RecordingApiClient(deleteDataResult: () async => null);
      final container = containerWith(client);

      await actionsWith(container).delete('b1');

      expect(client.deleteUrlCalls, isEmpty);
    });

    test('非法 URL 直接跳过，不抛异常', () async {
      final client = _RecordingApiClient(
        deleteDataResult: () async => {
          'deleted': true,
          'deleteUrls': ['not a url', 'https://s3.0icey.icu/x.png?e=1&s=z'],
        },
      );
      final container = containerWith(client);

      await actionsWith(container).delete('b1');

      expect(client.deleteUrlCalls, ['https://s3.0icey.icu/x.png?e=1&s=z']);
    });
  });
}
