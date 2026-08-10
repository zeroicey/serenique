import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import 'location_api.dart';

final locationApiProvider =
    Provider<LocationApi>((ref) => LocationApi(ref.watch(apiClientProvider)));

/// 后端位置代理是否启用（AMAP_KEY 已配置）。
/// FutureProvider 缓存：同会话内只查一次；enabled=false 时创建页不显示入口。
final locationConfigProvider = FutureProvider<bool>((ref) async {
  return ref.watch(locationApiProvider).config();
});
