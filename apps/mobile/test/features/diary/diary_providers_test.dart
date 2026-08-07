import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/diary/diary_api.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';
import 'package:serenique_mobile/features/diary/diary_providers.dart';

/// 假 DiaryApi：只让 getByDate 抛指定错误，其余方法不应被调用。
class _FakeDiaryApi implements DiaryApi {
  _FakeDiaryApi({this.getByDateError});

  final Object? getByDateError;

  @override
  Future<DiaryEntry> getByDate(String date) async {
    final err = getByDateError;
    if (err != null) throw err;
    throw StateError('getByDate 不应在未配置错误时被调用');
  }

  @override
  Future<List<DiaryEntry>> list({int page = 1, int pageSize = 50}) async =>
      const [];

  @override
  Future<int> count() async => 0;

  @override
  Future<DiaryEntry> create({String? diaryDate, required String content}) {
    throw UnimplementedError();
  }

  @override
  Future<DiaryEntry> update(String id, String content) {
    throw UnimplementedError();
  }

  @override
  Future<void> delete(String id) async {}
}

void main() {
  test('404（无 code 字段）时 diaryByDate 解析为 null', () async {
    final container = ProviderContainer(overrides: [
      diaryApiProvider.overrideWithValue(
        _FakeDiaryApi(
          getByDateError:
              const ApiException('API_ERROR', '日记不存在', statusCode: 404),
        ),
      ),
    ]);
    addTearDown(container.dispose);

    final provider = diaryByDateProvider('2026-08-07');
    final sub = container.listen(provider, (_, _) {});
    addTearDown(sub.close);

    final value = await container.read(provider.future);
    expect(value, isNull);
  });

  test('非 404 错误仍以 error 上抛', () async {
    final container = ProviderContainer(overrides: [
      diaryApiProvider.overrideWithValue(
        _FakeDiaryApi(
          getByDateError:
              const ApiException('INTERNAL', '服务器开小差了', statusCode: 500),
        ),
      ),
    ]);
    addTearDown(container.dispose);

    final provider = diaryByDateProvider('2026-08-07');
    final sub = container.listen(provider, (_, _) {});
    addTearDown(sub.close);
    container.read(provider);
    await pumpEventQueue();

    // Riverpod 3：FutureProvider 出错时落到 AsyncLoading(error:...)，
    // 通过 hasError / error 断言错误确实上抛（未被吞掉）。
    final state = container.read(provider);
    expect(state.hasError, isTrue);
    expect(state.error, isA<ApiException>());
  });
}
