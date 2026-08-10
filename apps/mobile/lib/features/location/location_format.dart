import '../moment/moment_models.dart';

/// 位置展示标签：name 优先；无 name 时退回坐标（4 位小数）。
String locationLabel(MomentLocation location) {
  final name = location.name?.trim();
  if (name != null && name.isNotEmpty) return name;
  if (location.latitude != null && location.longitude != null) {
    return '${location.latitude!.toStringAsFixed(4)}, '
        '${location.longitude!.toStringAsFixed(4)}';
  }
  return '';
}

/// 距离文案：≥1000m 显示 km 保留 1 位小数，否则整米。
/// 例如 1200 → '1.2km'，950 → '950m'。
String formatDistance(double meters) {
  if (meters >= 1000) return '${(meters / 1000).toStringAsFixed(1)}km';
  return '${meters.round()}m';
}

/// 高德深链 URL。position 是「经度,纬度」顺序（高德约定，勿调换）。
/// 仅在有坐标时调用（调用方保证）。
String amapDeepLink(MomentLocation location) {
  return 'https://uri.amap.com/marker'
      '?position=${location.longitude},${location.latitude}'
      '&name=${Uri.encodeComponent(location.name ?? '')}'
      '&callnative=1';
}
