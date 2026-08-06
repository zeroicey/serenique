import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';
import 'diary_models.dart';

/// diary 的 HTTP 封装。
class DiaryApi {
  DiaryApi(this._client);

  final ApiClient _client;

  Future<List<DiaryEntry>> list({int page = 1, int pageSize = 50}) async {
    final data =
        await _client.getData('/api/diaries', query: {'page': page, 'pageSize': pageSize});
    return unwrapItems(data)
        .map((e) => DiaryEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 按日期取（YYYY-MM-DD）。当天没有 → 后端 404 → ApiException(NOT_FOUND)。
  Future<DiaryEntry> getByDate(String date) async {
    final data = await _client.getData('/api/diaries/by-date/$date');
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  /// 创建。diaryDate 不传时后端默认今天。
  Future<DiaryEntry> create({String? diaryDate, required String content}) async {
    final data = await _client.postData('/api/diaries', body: {
      'content': content,
      'diaryDate': ?diaryDate,
    });
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<DiaryEntry> update(String id, String content) async {
    final data = await _client.putData('/api/diaries/$id', body: {'content': content});
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _client.deleteData('/api/diaries/$id');
  }
}
