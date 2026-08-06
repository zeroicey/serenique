import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'diary_api.dart';
import 'diary_models.dart';

final diaryApiProvider = Provider<DiaryApi>((ref) => DiaryApi(ref.watch(apiClientProvider)));

final diaryListProvider = FutureProvider<List<DiaryEntry>>((ref) async {
  return ref.watch(diaryApiProvider).list();
});

/// 按日期取；当天没有日记 → null（编辑页据此决定新建/编辑）。
final diaryByDateProvider = FutureProvider.family<DiaryEntry?, String>((ref, date) async {
  try {
    return await ref.watch(diaryApiProvider).getByDate(date);
  } on ApiException catch (e) {
    if (e.code == 'NOT_FOUND') return null;
    rethrow;
  }
});

/// 写操作：按「当天是否已有日记」决定 update / create。
class DiaryActions {
  DiaryActions(this._ref);

  final Ref _ref;
  DiaryApi get _api => _ref.read(diaryApiProvider);

  Future<DiaryEntry> save({
    String? existingId,
    required String date,
    required String content,
  }) async {
    final entry = existingId != null
        ? await _api.update(existingId, content)
        : await _api.create(diaryDate: date, content: content);
    _ref.invalidate(diaryByDateProvider(date));
    _ref.invalidate(diaryListProvider);
    return entry;
  }

  Future<void> delete({required String id, required String date}) async {
    await _api.delete(id);
    _ref.invalidate(diaryListProvider);
    _ref.invalidate(diaryByDateProvider(date));
  }
}

final diaryActionsProvider = Provider<DiaryActions>((ref) => DiaryActions(ref));
