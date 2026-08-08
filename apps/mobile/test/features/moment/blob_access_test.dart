import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/blob_access.dart';

void main() {
  test('未过期缓存命中：第二次 resolve 不再调 fetchLink', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );

    final first = await service.resolve('b1');
    final second = await service.resolve('b1');
    expect(first, 'http://api/b1/signed');
    expect(second, first);
    expect(calls, 1);
  });

  test('过期链接被重新申请', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );
    await service.resolve('b1');
    await service.resolve('b1');
    expect(calls, 2);
  });

  test('fetchLink 抛错时回退直链，且不缓存', () async {
    var fail = true;
    final service = BlobAccessService(
      fetchLink: (id) async {
        if (fail) throw Exception('boom');
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );

    expect(await service.resolve('b1'), 'http://api/b1/direct');

    // 恢复后再次 resolve 走签名链接
    fail = false;
    expect(await service.resolve('b1'), 'http://api/b1/signed');
  });

  test('clear 清空缓存后重新申请', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );
    await service.resolve('b1');
    service.clear();
    await service.resolve('b1');
    expect(calls, 2);
  });

  test('BlobAccessLink.isExpired 判断', () {
    expect(BlobAccessLink(url: 'u', expiresAt: DateTime.now().add(const Duration(minutes: 1))).isExpired, isFalse);
    expect(BlobAccessLink(url: 'u', expiresAt: DateTime.now().subtract(const Duration(minutes: 1))).isExpired, isTrue);
  });
}
