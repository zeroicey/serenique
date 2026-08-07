import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/auth/auth_token.dart';

void main() {
  group('repairTokenEncoding', () {
    test('普通 ASCII token 原样返回（幂等）', () {
      const t = 'abc123def456';
      expect(repairTokenEncoding(t), t);
    });

    test('还原 UTF-16 字节序错位损坏的 token', () {
      // 真实场景：微信等来源复制时，ASCII hex 串被编码成低字节为 0 的 CJK 字形
      // （如 '5'(U+0035) → U+3500『㔀』），HTTP 请求头不认 → 发送前抛异常。
      const original = '58f50c1960e2d013cd557bbe8e69fab4';
      final mangled = String.fromCharCodes(original.runes.map((r) => r << 8));
      expect(mangled.runes.every((r) => (r & 0xff) == 0), isTrue);
      expect(mangled, isNot(original));
      expect(repairTokenEncoding(mangled), original);
    });

    test('含不可还原字符（真汉字）时返回 null', () {
      expect(repairTokenEncoding('abc汉字def'), isNull);
    });

    test('全角空格（U+3000，损坏特征之一）能还原为 0', () {
      // U+3000 → 高字节 0x30 = '0'
      expect(repairTokenEncoding('0　1'), '001');
    });
  });

  group('isHeaderSafeToken', () {
    test('纯 hex 可用', () {
      expect(isHeaderSafeToken('58f50c1960e2d013cd557bbe8e69fab4'), isTrue);
    });

    test('含空格不可用', () {
      expect(isHeaderSafeToken('abc def'), isFalse);
    });

    test('含 CJK 不可用', () {
      expect(isHeaderSafeToken('㔀㠀昀㔀挀㄀'), isFalse);
    });

    test('空串不可用', () {
      expect(isHeaderSafeToken(''), isFalse);
    });
  });
}
