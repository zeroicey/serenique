import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/location/location_api.dart';
import 'package:serenique_mobile/features/location/location_providers.dart';
import 'package:serenique_mobile/features/location/widgets/location_picker_sheet.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

/// 假 LocationApi：记录 nearby/search 调用参数，返回可配置结果。
class _FakeLocationApi extends LocationApi {
  _FakeLocationApi()
      : super(ApiClient(baseUrl: 'http://localhost', tokenReader: () => null));

  int nearbyCalls = 0;
  int searchCalls = 0;
  String? lastKeyword;
  double? lastLng;
  double? lastLat;
  List<LocationPoi> nearbyResult = [];
  List<LocationPoi> searchResult = [];
  Object? nearbyError;

  @override
  Future<List<LocationPoi>> nearby(double lng, double lat,
      {int radius = 3000}) async {
    nearbyCalls++;
    lastLng = lng;
    lastLat = lat;
    final err = nearbyError;
    if (err != null) throw err;
    return nearbyResult;
  }

  @override
  Future<List<LocationPoi>> search(String keyword,
      {double? lng, double? lat}) async {
    searchCalls++;
    lastKeyword = keyword;
    lastLng = lng;
    lastLat = lat;
    return searchResult;
  }
}

LocationPoi _poi(String name, {double distance = 500}) => LocationPoi(
      name: name,
      latitude: 39.9,
      longitude: 116.4,
      distance: distance,
    );

/// 测试壳：按钮打开选点 sheet，把返回值显示出来。
class _Harness extends ConsumerStatefulWidget {
  const _Harness({required this.locate});

  final LocateFunction locate;

  @override
  ConsumerState<_Harness> createState() => _HarnessState();
}

class _HarnessState extends ConsumerState<_Harness> {
  MomentLocation? result;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(
              onPressed: () async {
                final r = await showLocationPickerSheet(context,
                    locate: widget.locate);
                if (!mounted) return;
                setState(() => result = r);
              },
              child: const Text('打开选点'),
            ),
            if (result != null) Text('已选: ${result!.name}'),
          ],
        ),
      ),
    );
  }
}

void main() {
  Future<_FakeLocationApi> pumpSheet(
    WidgetTester tester, {
    required LocateFunction locate,
    _FakeLocationApi? api,
  }) async {
    final fakeApi = api ?? _FakeLocationApi();
    await tester.pumpWidget(ProviderScope(
      overrides: [locationApiProvider.overrideWithValue(fakeApi)],
      child: MaterialApp(home: _Harness(locate: locate)),
    ));
    await tester.tap(find.text('打开选点'));
    await tester.pumpAndSettle();
    return fakeApi;
  }

  testWidgets('定位成功：附近列表渲染 name + 距离格式（米/km）', (tester) async {
    final api = _FakeLocationApi()
      ..nearbyResult = [_poi('咖啡店', distance: 950), _poi('公园', distance: 1200)];
    await pumpSheet(tester,
        locate: () async => (latitude: 39.98, longitude: 116.31), api: api);

    expect(api.nearbyCalls, 1);
    expect(api.lastLng, 116.31);
    expect(api.lastLat, 39.98);
    expect(find.text('咖啡店'), findsOneWidget);
    expect(find.text('950m'), findsOneWidget);
    expect(find.text('公园'), findsOneWidget);
    expect(find.text('1.2km'), findsOneWidget);
  });

  testWidgets('定位失败：提示可直接搜索，搜索不带坐标', (tester) async {
    final api = _FakeLocationApi()..searchResult = [_poi('星巴克')];
    await pumpSheet(tester, locate: () async => null, api: api);

    expect(find.text('无法获取当前位置，可直接搜索'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '星巴克');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    expect(api.searchCalls, 1);
    expect(api.lastKeyword, '星巴克');
    expect(api.lastLng, isNull);
    expect(api.lastLat, isNull);
    // 输入框里也有「星巴克」文本，需限定 ListTile 里的结果项
    expect(find.widgetWithText(ListTile, '星巴克'), findsOneWidget);
  });

  testWidgets('搜索防抖：连续输入只发一次；清空回到附近列表', (tester) async {
    final api = _FakeLocationApi()
      ..nearbyResult = [_poi('附近点', distance: 100)]
      ..searchResult = [_poi('目标地点')];
    await pumpSheet(tester,
        locate: () async => (latitude: 39.98, longitude: 116.31), api: api);
    expect(find.text('附近点'), findsOneWidget);

    // 快速连续输入（< 300ms 间隔），只应触发一次 search
    await tester.enterText(find.byType(TextField), '目');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), '目标');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), '目标地点');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();

    expect(api.searchCalls, 1);
    expect(api.lastKeyword, '目标地点');
    expect(find.widgetWithText(ListTile, '目标地点'), findsOneWidget);

    // 清空 → 回到附近列表（带定位坐标）
    await tester.tap(find.byIcon(Icons.clear));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(api.nearbyCalls, 2);
    expect(find.text('附近点'), findsOneWidget);
  });

  testWidgets('点击列表项：返回选中的 MomentLocation', (tester) async {
    final api = _FakeLocationApi()
      ..nearbyResult = [_poi('咖啡店', distance: 950)];
    await pumpSheet(tester,
        locate: () async => (latitude: 39.98, longitude: 116.31), api: api);

    await tester.tap(find.text('咖啡店'));
    await tester.pumpAndSettle();

    expect(find.text('已选: 咖啡店'), findsOneWidget);
    expect(find.byType(ListTile), findsNothing); // sheet 已关闭
  });

  testWidgets('附近接口失败：显示错误提示', (tester) async {
    final api = _FakeLocationApi()..nearbyError = Exception('boom');
    await pumpSheet(tester,
        locate: () async => (latitude: 39.98, longitude: 116.31), api: api);

    expect(find.text('加载地点失败，请稍后重试'), findsOneWidget);
  });
}
