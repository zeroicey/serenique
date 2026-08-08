import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/media_format.dart';

void main() {
  test('formatMediaDuration 格式化为 m:ss', () {
    expect(formatMediaDuration(Duration.zero), '0:00');
    expect(formatMediaDuration(const Duration(seconds: 5)), '0:05');
    expect(formatMediaDuration(const Duration(seconds: 65)), '1:05');
    expect(formatMediaDuration(const Duration(minutes: 12)), '12:00');
  });

  test('超过 1 小时格式化为 h:mm:ss', () {
    expect(formatMediaDuration(const Duration(hours: 1, minutes: 1, seconds: 1)),
        '1:01:01');
  });
}
