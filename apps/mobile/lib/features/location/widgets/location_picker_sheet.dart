import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../moment/moment_models.dart';
import '../location_api.dart';
import '../location_format.dart';
import '../location_providers.dart';

/// 定位结果：设备 WGS-84 坐标（传给后端代理，由后端转 GCJ-02）。
typedef LocateResult = ({double latitude, double longitude});

/// 定位函数签名：可注入用于测试；失败/超时/权限被拒返回 null。
typedef LocateFunction = Future<LocateResult?> Function();

/// 默认定位实现：geolocator 前台定位（WhenInUse），8 秒超时。
/// 权限由 geolocator 自行请求（拒绝后返回 null，不弹系统设置引导）。
Future<LocateResult?> locateWithGeolocator() async {
  try {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.medium,
        timeLimit: Duration(seconds: 8),
      ),
    );
    return (latitude: pos.latitude, longitude: pos.longitude);
  } catch (_) {
    return null; // 超时/定位失败等一律视为不可定位，仍可搜索
  }
}

/// 打开选点 bottom sheet（朋友圈式），返回选中的位置；取消返回 null。
/// [locate] 默认走 geolocator，测试可注入假定位。
Future<MomentLocation?> showLocationPickerSheet(
  BuildContext context, {
  LocateFunction? locate,
}) {
  return showModalBottomSheet<MomentLocation>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      // 键盘弹出时抬升 sheet（配合 isScrollControlled）
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: LocationPickerSheet(locate: locate ?? locateWithGeolocator),
    ),
  );
}

/// 选点 sheet：打开即定位 → 附近列表；顶部搜索框（300ms 防抖），
/// 空输入回到附近列表；列表项点击返回选中位置。
class LocationPickerSheet extends ConsumerStatefulWidget {
  const LocationPickerSheet({super.key, required this.locate});

  final LocateFunction locate;

  @override
  ConsumerState<LocationPickerSheet> createState() =>
      _LocationPickerSheetState();
}

class _LocationPickerSheetState extends ConsumerState<LocationPickerSheet> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  /// 定位成功的设备坐标（WGS-84），透传给 nearby/search。
  LocateResult? _coords;
  bool _locating = true;
  bool _locateFailed = false;
  bool _loading = false;
  String? _error;
  List<LocationPoi> _pois = const [];

  LocationApi get _api => ref.read(locationApiProvider);

  @override
  void initState() {
    super.initState();
    _loadNearby();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadNearby() async {
    setState(() {
      _locating = true;
      _locateFailed = false;
      _pois = const [];
    });
    final result = await widget.locate();
    if (!mounted) return;
    setState(() {
      _locating = false;
      _coords = result;
      _locateFailed = result == null;
    });
    if (result != null) {
      await _fetch(() =>
          _api.nearby(result.longitude, result.latitude));
    }
  }

  void _onSearchChanged(String keyword) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      if (!mounted) return;
      final kw = keyword.trim();
      if (kw.isEmpty) {
        final coords = _coords;
        if (coords != null) {
          await _fetch(() => _api.nearby(coords.longitude, coords.latitude));
        } else {
          setState(() {
            _pois = const [];
            _error = null;
          });
        }
        return;
      }
      final coords = _coords;
      await _fetch(() => _api.search(kw,
          lng: coords?.longitude, lat: coords?.latitude));
    });
  }

  Future<void> _fetch(Future<List<LocationPoi>> Function() request) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final pois = await request();
      if (!mounted) return;
      setState(() => _pois = pois);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '加载地点失败，请稍后重试');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _select(LocationPoi poi) {
    Navigator.pop(context, MomentLocation(
      name: poi.name,
      latitude: poi.latitude,
      longitude: poi.longitude,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: scheme.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text('选择位置',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: '搜索地点',
                  isDense: true,
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _searchController,
                    builder: (context, value, _) => value.text.isEmpty
                        ? const SizedBox.shrink()
                        : IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            tooltip: '清除',
                            onPressed: () {
                              _searchController.clear();
                              _onSearchChanged('');
                            },
                          ),
                  ),
                  filled: true,
                  fillColor: scheme.surfaceContainerHighest,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              if (_locating)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Column(children: [
                      SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                      SizedBox(height: 8),
                      Text('正在定位…'),
                    ]),
                  ),
                )
              else if (_locateFailed)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(children: [
                    Icon(Icons.location_off_outlined,
                        size: 14, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text('无法获取当前位置，可直接搜索',
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant)),
                  ]),
                ),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                      child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))),
                )
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                      child: Text(_error!,
                          style: TextStyle(
                              fontSize: 12, color: scheme.error))),
                )
              else if (_pois.isEmpty && !_locating && !_locateFailed)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('未找到地点')),
                ),
              if (_pois.isNotEmpty)
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _pois.length,
                    itemBuilder: (context, i) {
                      final poi = _pois[i];
                      return ListTile(
                        dense: true,
                        leading: Icon(Icons.place_outlined,
                            size: 20, color: scheme.primary),
                        title: Text(poi.name, maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        subtitle: poi.address == null ||
                                poi.address!.isEmpty
                            ? null
                            : Text(poi.address!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                        trailing: poi.distance == null
                            ? null
                            : Text(formatDistance(poi.distance!),
                                style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant)),
                        onTap: () => _select(poi),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
