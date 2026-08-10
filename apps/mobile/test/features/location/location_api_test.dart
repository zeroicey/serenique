import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/location/location_api.dart';

class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(this.onRequest);

  final String Function(RequestOptions options) onRequest;
  String? lastPath;
  Map<String, dynamic>? lastQuery;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastPath = options.path;
    lastQuery = options.queryParameters;
    return ResponseBody.fromString(
      onRequest(options),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(_RecordingAdapter adapter) => ApiClient(
      baseUrl: 'https://api.test',
      tokenReader: () => null,
      dio: Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );

String _data(Object data) =>
    jsonEncode({'success': true, 'message': 'ok', 'data': data});

void main() {
  test('config 解包 enabled（true）', () async {
    final adapter = _RecordingAdapter((_) => _data({'enabled': true}));
    final enabled = await LocationApi(_client(adapter)).config();
    expect(enabled, isTrue);
    expect(adapter.lastPath, '/api/location/config');
  });

  test('config 缺 enabled 默认 false', () async {
    final adapter = _RecordingAdapter((_) => _data(<String, Object?>{}));
    expect(await LocationApi(_client(adapter)).config(), isFalse);
  });

  test('nearby 传 WGS-84 坐标与 radius，解包 items', () async {
    final adapter = _RecordingAdapter((_) => _data({
          'items': [
            {
              'name': '星巴克（中关村店）',
              'latitude': 39.9827,
              'longitude': 116.3162,
              'address': '中关村大街 27 号',
              'distance': 345.6,
            },
            {
              'name': '海淀公园',
              'latitude': 39.9861,
              'longitude': 116.3126,
            },
          ],
        }));
    final pois = await LocationApi(_client(adapter))
        .nearby(116.30, 39.98, radius: 5000);
    expect(adapter.lastPath, '/api/location/nearby');
    expect(adapter.lastQuery!['lng'], 116.30);
    expect(adapter.lastQuery!['lat'], 39.98);
    expect(adapter.lastQuery!['radius'], 5000);
    expect(pois, hasLength(2));
    expect(pois[0].name, '星巴克（中关村店）');
    expect(pois[0].distance, 345.6);
    expect(pois[0].address, '中关村大街 27 号');
    expect(pois[1].distance, isNull);
  });

  test('search 无坐标时不带 lng/lat', () async {
    final adapter = _RecordingAdapter((_) => _data({
          'items': [
            {'name': '故宫', 'latitude': 39.9163, 'longitude': 116.3972},
          ],
        }));
    final pois = await LocationApi(_client(adapter)).search('故宫');
    expect(adapter.lastPath, '/api/location/search');
    expect(adapter.lastQuery!['keyword'], '故宫');
    expect(adapter.lastQuery!.containsKey('lng'), isFalse);
    expect(adapter.lastQuery!.containsKey('lat'), isFalse);
    expect(pois.single.name, '故宫');
  });

  test('search 有坐标时附上 lng/lat', () async {
    final adapter = _RecordingAdapter((_) => _data({'items': <Object>[]}));
    await LocationApi(_client(adapter))
        .search('咖啡馆', lng: 116.31, lat: 39.98);
    expect(adapter.lastQuery!['lng'], 116.31);
    expect(adapter.lastQuery!['lat'], 39.98);
  });
}
