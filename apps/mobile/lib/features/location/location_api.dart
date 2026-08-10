import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';

/// POI（对齐 services/api 的 LocationItem）：name/latitude/longitude 必填，address/distance 可选。
/// 坐标是后端转换后的 GCJ-02，直接用于存储与高德深链，客户端不做任何坐标系转换。
class LocationPoi {
  const LocationPoi({
    required this.name,
    required this.latitude,
    required this.longitude,
    this.address,
    this.distance,
  });

  final String name;
  final double latitude;
  final double longitude;

  /// 详细地址（高德返回，可能为空）。
  final String? address;

  /// 距定位点的距离（米，nearby 返回；search 通常没有）。
  final double? distance;

  factory LocationPoi.fromJson(Map<String, dynamic> json) => LocationPoi(
        name: json['name'] as String? ?? '',
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        address: json['address'] as String?,
        distance: (json['distance'] as num?)?.toDouble(),
      );
}

/// 位置代理接口：统一走后端 `/api/location/*`（后端转发高德 Web 服务），
/// 客户端只传设备 WGS-84 坐标，不需要高德 key、不引高德 SDK。
class LocationApi {
  LocationApi(this._client);

  final ApiClient _client;

  /// GET /api/location/config → { enabled }：AMAP_KEY 是否已配置。
  Future<bool> config() async {
    final data = await _client.getData('/api/location/config');
    return (data as Map<String, dynamic>)['enabled'] as bool? ?? false;
  }

  /// GET /api/location/nearby?lng=&lat=&radius= → { items: [...] }。
  /// lng/lat 为设备 WGS-84 坐标，radius 米（默认 3000）。
  Future<List<LocationPoi>> nearby(double lng, double lat,
      {int radius = 3000}) async {
    final data = await _client.getData('/api/location/nearby',
        query: {'lng': lng, 'lat': lat, 'radius': radius});
    return unwrapItems(data)
        .map((e) => LocationPoi.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/location/search?keyword=&lng=&lat= → { items: [...] }。
  /// lng/lat 可选（定位成功时附上，后端就近优先）；同样传 WGS-84。
  Future<List<LocationPoi>> search(String keyword,
      {double? lng, double? lat}) async {
    final data = await _client.getData('/api/location/search', query: {
      'keyword': keyword,
      'lng': ?lng,
      'lat': ?lat,
    });
    return unwrapItems(data)
        .map((e) => LocationPoi.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
