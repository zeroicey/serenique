import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/location/location_format.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

void main() {
  group('locationLabel', () {
    test('name 优先', () {
      expect(
        locationLabel(
            const MomentLocation(name: '星巴克', latitude: 39.9, longitude: 116.4)),
        '星巴克',
      );
    });

    test('无 name 时显示坐标（4 位小数，经度,纬度顺序）', () {
      expect(
        locationLabel(
            const MomentLocation(latitude: 39.90871, longitude: 116.3975)),
        '39.9087, 116.3975',
      );
    });

    test('name 为空串也退回坐标', () {
      expect(
        locationLabel(
            const MomentLocation(name: '  ', latitude: 30.0, longitude: 120.0)),
        '30.0000, 120.0000',
      );
    });

    test('name 与坐标都缺时返回空串（防御）', () {
      expect(locationLabel(const MomentLocation()), '');
    });
  });

  group('formatDistance', () {
    test('≥1000m 显示 km 保留 1 位', () {
      expect(formatDistance(1200), '1.2km');
      expect(formatDistance(1000), '1.0km');
      expect(formatDistance(15600), '15.6km');
    });

    test('不足 1000m 显示整米', () {
      expect(formatDistance(950), '950m');
      expect(formatDistance(999.6), '1000m');
      expect(formatDistance(12.4), '12m');
      expect(formatDistance(0), '0m');
    });
  });

  group('amapDeepLink', () {
    test('position 是 经度,纬度 顺序，name 做 URL 编码', () {
      final url = amapDeepLink(
          const MomentLocation(name: '天安门 广场', latitude: 39.9087, longitude: 116.3975));
      expect(
        url,
        'https://uri.amap.com/marker?position=116.3975,39.9087'
        '&name=${Uri.encodeComponent('天安门 广场')}&callnative=1',
      );
    });

    test('无 name 时 name 参数为空', () {
      final url = amapDeepLink(
          const MomentLocation(latitude: 39.9087, longitude: 116.3975));
      expect(url, 'https://uri.amap.com/marker?position=116.3975,39.9087&name=&callnative=1');
    });
  });
}
