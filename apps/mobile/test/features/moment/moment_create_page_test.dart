import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/location/location_api.dart';
import 'package:serenique_mobile/features/location/location_providers.dart';
import 'package:serenique_mobile/features/moment/moment_api.dart';
import 'package:serenique_mobile/features/moment/moment_create_page.dart';
import 'package:serenique_mobile/features/moment/moment_draft_storage.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/local_attachment_grid.dart';
import '../../helpers.dart';

/// mock geolocator 原生通道：测试环境无原生实现，不 mock 会一直挂起。
/// 权限 granted（whileInUse）+ 固定坐标，让选点 sheet 走通完整定位流程。
void mockGeolocator(WidgetTester tester) {
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('flutter.baseflow.com/geolocator'),
    (call) async {
      switch (call.method) {
        case 'checkPermission':
        case 'requestPermission':
          return 2; // LocationPermission.whileInUse
        case 'getCurrentPosition':
          return {
            'latitude': 39.98,
            'longitude': 116.31,
            'accuracy': 10.0,
            'altitude': 0.0,
            'altitudeAccuracy': 5.0,
            'heading': 0.0,
            'headingAccuracy': 0.0,
            'speed': 0.0,
            'speedAccuracy': 0.0,
            'timestamp': 0,
          };
        default:
          return null;
      }
    },
  );
}

/// 假 MomentApi：记录 uploadBlob 调用与 create 收到的附件；
/// 配置 uploadError 后 uploadBlob 抛错（模拟上传失败）。
class _FakeMomentApi extends MomentApi {
  _FakeMomentApi({this.uploadError})
    : super(ApiClient(baseUrl: 'http://localhost', tokenReader: () => null));

  final Object? uploadError;
  int uploadCount = 0;
  String? createText;
  List<MomentAttachmentInput>? createAttachments;
  MomentLocation? createLocation;
  List<String>? createTags;

  @override
  Future<MomentBlob> uploadBlob(
    Uint8List bytes, {
    required String filename,
    required String mimeType,
  }) async {
    uploadCount++;
    final err = uploadError;
    if (err != null) throw err;
    return MomentBlob(
      id: 'blob-$uploadCount',
      originalName: filename,
      mimeType: mimeType,
      size: bytes.length,
      fileUrl: '',
      createdAt: '',
    );
  }

  @override
  Future<Moment> create(
    String text, {
    List<MomentAttachmentInput> attachments = const [],
    MomentLocation? location,
    List<String> tags = const [],
  }) async {
    createText = text;
    createAttachments = attachments;
    createLocation = location;
    createTags = tags;
    return Moment(
      id: 'm1',
      text: text,
      location: location,
      tags: tags.isEmpty
          ? const []
          : tags
                .map((id) => MomentTag(id: id, name: 'tag$id', momentCount: 0))
                .toList(),
      comments: const [],
      commentCount: 0,
      createdAt: '',
      updatedAt: '',
    );
  }
}

/// 假 LocationApi：搜索返回可配置结果（用于选点流程；定位在测试环境自然失败）。
class _FakeLocationApi extends LocationApi {
  _FakeLocationApi()
    : super(ApiClient(baseUrl: 'http://localhost', tokenReader: () => null));

  List<LocationPoi> searchResult = [];

  @override
  Future<List<LocationPoi>> search(
    String keyword, {
    double? lng,
    double? lat,
  }) async {
    return searchResult;
  }

  @override
  Future<List<LocationPoi>> nearby(
    double lng,
    double lat, {
    int radius = 3000,
  }) async {
    return searchResult;
  }
}

/// 内存版草稿存储：测试注入，避免触碰真实 SharedPreferences。
class _MemoryDraftStorage implements MomentDraftStorage {
  String? value;
  int writes = 0;
  int deletes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String text) async {
    value = text;
    writes++;
  }

  @override
  Future<void> delete() async {
    value = null;
    deletes++;
  }
}

void main() {
  Future<void> pumpCreate(
    WidgetTester tester, {
    List<PickedAttachment>? initial,
    _FakeMomentApi? api,
    _FakeLocationApi? locationApi,
    bool? locationEnabled,
    MomentDraftStorage? draftStorage,
  }) async {
    // 总是注入内存版草稿存储：真实 SharedPrefs 在测试环境无 method channel mock 会挂起
    final effectiveDraft = draftStorage ?? _MemoryDraftStorage();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier(const []),
          ),
          momentDraftStorageProvider.overrideWithValue(effectiveDraft),
          if (locationEnabled != null)
            locationConfigProvider.overrideWith((ref) async => locationEnabled),
          if (locationApi != null)
            locationApiProvider.overrideWithValue(locationApi),
          if (initial != null)
            pickedAttachmentsProvider.overrideWith(
              () => PickedAttachments(initial: initial),
            ),
          if (api != null) ...[
            momentApiProvider.overrideWithValue(api),
            pickedAttachmentsProvider.overrideWith(PickedAttachments.new),
          ],
        ],
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/moments/create',
            routes: [
              GoRoute(
                path: '/moments',
                builder: (_, _) => const Scaffold(body: SizedBox()),
                routes: [
                  GoRoute(
                    path: 'create',
                    builder: (_, _) => const MomentCreatePage(),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// 通过 ProviderContainer 写入已选附件（模拟选择完图片的状态）。
  ProviderContainer presetAttachments(
    WidgetTester tester,
    List<PickedAttachment> attachments,
  ) {
    final container = ProviderScope.containerOf(
      tester.element(find.byType(MomentCreatePage)),
    );
    container.read(pickedAttachmentsProvider.notifier).set(attachments);
    return container;
  }

  testWidgets('空文字发表被拦截', (tester) async {
    await pumpCreate(tester);
    await tester.tap(find.text('发表'));
    await tester.pump();
    expect(find.text('内容不能为空'), findsOneWidget);
  });

  testWidgets('有附件时显示本地网格', (tester) async {
    await pumpCreate(
      tester,
      initial: [
        PickedAttachment(
          bytes: Uint8List.fromList([1]),
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          localPath: '/tmp/a.jpg',
        ),
      ],
    );
    expect(find.byType(LocalAttachmentGrid), findsOneWidget);
    expect(find.text('a.jpg'), findsNothing); // 图片瓦片不显示文件名
  });

  testWidgets('发表带附件：逐个上传后创建并清空已选', (tester) async {
    final api = _FakeMomentApi();
    await pumpCreate(tester, api: api);
    final container = presetAttachments(tester, [
      PickedAttachment(
        bytes: Uint8List.fromList([1]),
        filename: 'a.jpg',
        mimeType: 'image/jpeg',
        localPath: '/tmp/a.jpg',
      ),
      PickedAttachment(
        bytes: Uint8List.fromList([2]),
        filename: 'b.png',
        mimeType: 'image/png',
        localPath: '/tmp/b.png',
      ),
    ]);
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, '看图');
    await tester.tap(find.text('发表'));
    await tester.pumpAndSettle();

    expect(api.uploadCount, 2);
    expect(api.createText, '看图');
    expect(api.createAttachments, hasLength(2));
    expect(api.createAttachments!.map((a) => a.blobId).toList(), [
      'blob-1',
      'blob-2',
    ]);
    expect(container.read(pickedAttachmentsProvider), isEmpty);
  });

  testWidgets('上传失败：提示并保留附件，页面不关闭', (tester) async {
    final api = _FakeMomentApi(
      uploadError: const ApiException('UPLOAD_FAILED', '上传失败'),
    );
    await pumpCreate(tester, api: api);
    final container = presetAttachments(tester, [
      PickedAttachment(
        bytes: Uint8List.fromList([1]),
        filename: 'a.jpg',
        mimeType: 'image/jpeg',
        localPath: '/tmp/a.jpg',
      ),
    ]);
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, '看图');
    await tester.tap(find.text('发表'));
    await tester.pumpAndSettle();

    expect(find.text('上传失败'), findsOneWidget); // snackbar 出现
    expect(container.read(pickedAttachmentsProvider), hasLength(1)); // 附件保留
    expect(find.byType(MomentCreatePage), findsOneWidget); // 页面未 pop
    expect(find.byType(LocalAttachmentGrid), findsOneWidget);
  });

  group('所在位置', () {
    testWidgets('config enabled=false 时不显示入口', (tester) async {
      await pumpCreate(tester, locationEnabled: false);
      expect(find.text('不显示位置'), findsNothing);
    });

    testWidgets('enabled=true 时显示「不显示位置」，点开选点并选中', (tester) async {
      mockGeolocator(tester); // 测试环境无原生定位，mock 后走通完整定位→附近列表流程
      final locationApi = _FakeLocationApi()
        ..searchResult = [
          const LocationPoi(
            name: '星巴克',
            latitude: 39.9827,
            longitude: 116.3162,
          ),
        ];
      final api = _FakeMomentApi();
      await pumpCreate(
        tester,
        locationEnabled: true,
        locationApi: locationApi,
        api: api,
      );

      expect(find.text('不显示位置'), findsOneWidget);

      // 打开选点 sheet → 定位成功 → 附近列表直接出现 → 点击选中
      await tester.tap(find.text('不显示位置'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ListTile, '星巴克'), findsOneWidget);

      await tester.tap(find.widgetWithText(ListTile, '星巴克'));
      await tester.pumpAndSettle();

      // 选中后行显示「📍 名称」
      expect(find.text('📍 星巴克'), findsOneWidget);
      expect(find.text('不显示位置'), findsNothing);
    });

    testWidgets('选中后 × 清除恢复「不显示位置」', (tester) async {
      mockGeolocator(tester);
      final locationApi = _FakeLocationApi()
        ..searchResult = [
          const LocationPoi(name: '公园', latitude: 39.9, longitude: 116.4),
        ];
      final api = _FakeMomentApi();
      await pumpCreate(
        tester,
        locationEnabled: true,
        locationApi: locationApi,
        api: api,
      );

      await tester.tap(find.text('不显示位置'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ListTile, '公园'));
      await tester.pumpAndSettle();
      expect(find.text('📍 公园'), findsOneWidget);

      await tester.tap(find.byTooltip('清除位置'));
      await tester.pump();
      expect(find.text('不显示位置'), findsOneWidget);
      expect(find.text('📍 公园'), findsNothing);
    });

    testWidgets('发表时把选中的位置传给 create', (tester) async {
      mockGeolocator(tester);
      final locationApi = _FakeLocationApi()
        ..searchResult = [
          const LocationPoi(
            name: '星巴克',
            latitude: 39.9827,
            longitude: 116.3162,
          ),
        ];
      final api = _FakeMomentApi();
      await pumpCreate(
        tester,
        locationEnabled: true,
        locationApi: locationApi,
        api: api,
      );

      await tester.tap(find.text('不显示位置'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ListTile, '星巴克'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, '带位置');
      await tester.tap(find.text('发表'));
      await tester.pumpAndSettle();

      expect(
        api.createLocation,
        const MomentLocation(
          name: '星巴克',
          latitude: 39.9827,
          longitude: 116.3162,
        ),
      );
    });
  });

  group('草稿持久化', () {
    testWidgets('进入页面恢复已保存草稿', (tester) async {
      final draft = _MemoryDraftStorage()..value = '上次没写完的内容';
      await pumpCreate(tester, draftStorage: draft);
      await tester.pumpAndSettle();

      expect(find.text('上次没写完的内容'), findsOneWidget);
    });

    testWidgets('输入后防抖保存草稿（300ms 后写入）', (tester) async {
      final draft = _MemoryDraftStorage();
      await pumpCreate(tester, draftStorage: draft);

      await tester.enterText(find.byType(TextField).first, '正在写的闪记');
      await tester.pump(const Duration(milliseconds: 350));

      expect(draft.value, '正在写的闪记');
      expect(draft.writes, greaterThan(0));
    });

    testWidgets('删空文字后清除草稿', (tester) async {
      final draft = _MemoryDraftStorage()..value = '旧草稿';
      await pumpCreate(tester, draftStorage: draft);
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, '');
      await tester.pump(const Duration(milliseconds: 350));

      expect(draft.value, isNull);
      expect(draft.deletes, greaterThan(0));
    });

    testWidgets('发布成功后清除草稿', (tester) async {
      final draft = _MemoryDraftStorage()..value = '要发布的草稿';
      final api = _FakeMomentApi();
      await pumpCreate(tester, draftStorage: draft, api: api);
      await tester.pumpAndSettle();

      await tester.tap(find.text('发表'));
      await tester.pumpAndSettle();

      expect(draft.value, isNull);
      expect(draft.deletes, greaterThan(0));
    });

    testWidgets('返回页面保留草稿（防误触丢失）', (tester) async {
      final draft = _MemoryDraftStorage();
      await pumpCreate(tester, draftStorage: draft);

      await tester.enterText(find.byType(TextField).first, '误触前写的内容');
      await tester.pump(const Duration(milliseconds: 350));
      expect(draft.value, '误触前写的内容');

      // 卸载整棵树模拟页面销毁（dispose），草稿不被删除
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(milliseconds: 350));

      expect(draft.value, '误触前写的内容');
    });
  });
}
