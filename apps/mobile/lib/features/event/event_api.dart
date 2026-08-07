import '../../../core/network/api_client.dart';

/// 日历（Event）模块的 HTTP 封装（当前只接了计数，列表/增删改后续补）。
class EventApi {
  EventApi(this._client);

  final ApiClient _client;

  /// 今天的事件数：按本地日界取时间窗 [今天00:00, 明天00:00)，数返回的裸数组长度。
  Future<int> countToday() async {
    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day);
    final to = from.add(const Duration(days: 1));
    final data = await _client.getData('/api/events', query: {
      'from': _withOffset(from),
      'to': _withOffset(to),
    });
    return (data as List<dynamic>).length;
  }

  /// 后端要求 ISO 带时区偏移（offset: true），本地 DateTime 的 toIso8601String 无偏移，手动补。
  static String _withOffset(DateTime t) {
    final offset = t.timeZoneOffset;
    final sign = offset.isNegative ? '-' : '+';
    final h = offset.inHours.abs().toString().padLeft(2, '0');
    final m = (offset.inMinutes.abs() % 60).toString().padLeft(2, '0');
    return '${t.toIso8601String()}$sign$h:$m';
  }
}
