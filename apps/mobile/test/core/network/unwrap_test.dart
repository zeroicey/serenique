import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/core/network/unwrap.dart';

void main() {
  group('unwrapResponse', () {
    test('成功：返回 data', () {
      final data = unwrapResponse(
          {'success': true, 'message': '查询成功', 'data': {'id': '1'}});
      expect(data, {'id': '1'});
    });

    test('成功但无 data：返回 null', () {
      expect(unwrapResponse({'success': true, 'message': 'ok'}), isNull);
    });

    test('业务失败：抛 ApiException 带 code/message', () {
      expect(
        () => unwrapResponse(
            {'success': false, 'code': 'NOT_FOUND', 'message': '未找到'}),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'NOT_FOUND')
            .having((e) => e.message, 'message', '未找到')),
      );
    });

    test('响应不是对象：抛 BAD_RESPONSE', () {
      expect(() => unwrapResponse('oops'), throwsA(isA<ApiException>()));
    });
  });

  group('unwrapItems', () {
    test('分页对象 {items,total}', () {
      expect(unwrapItems({'items': [1, 2], 'total': 2}), [1, 2]);
    });

    test('裸数组', () {
      expect(unwrapItems([1, 2, 3]), [1, 2, 3]);
    });

    test('异常值 → 空列表', () {
      expect(unwrapItems(null), isEmpty);
      expect(unwrapItems('x'), isEmpty);
    });
  });
}
