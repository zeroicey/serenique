# Flutter 移动端 — Moment 附件显示/预览实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile` 的 Moment 支持附件显示与播放：列表/详情卡片渲染 3 列附件网格（图片/视频/音频），点击进入全屏预览页，左右滑动切换、图片缩放、视频/音频播放。**不做上传。**

**Architecture:** 媒体加载统一走后端签名链接（`POST /api/blobs/:id/access-link`，1 小时过期）——官方 `video_player` 不支持自定义请求头，凭证放 query 是唯一通用解（Web 端同思路）。新增纯 Dart 的 `BlobAccessService`（内存缓存 + 过期刷新 + 失败回退直链），`moment_providers.dart` 接线 `blobAccessUrlProvider`（`FutureProvider.autoDispose.family`）。预览页用 `PageView.builder`，天然只构建当前页，翻页即释放上一页播放器。

**Tech Stack:** Flutter 3.44.8 / Dart ^3.12.2；新增 `video_player ^2.13.0`（官方）、`just_audio ^0.10.6`；dev 依赖 `mocktail_image_network`（widget 测试拦截网络图片）。不加 `chewie` / `cached_network_image` / `photo_view`。

## Global Constraints

（来自 spec：`.ai/architecture/2026-08-08-flutter-moment-attachments-design.md`，违反即失败）

- 媒体加载统一走签名链接（`expiresInSeconds: 3600`）；失败回退 `/api/blobs/:id/file` 直链（dev 无鉴权时可用，与 Web 一致）。
- 签名链接只做**内存**缓存（不引磁盘缓存，签名 URL 磁盘缓存会命中失效链接）。
- 缩略图直载原图（后端无缩略图端点）；视频控制条**手写**（播放/暂停 + 进度 + 时长 + 全屏）。
- 依赖只加：`video_player`、`just_audio`（dev: `mocktail_image_network`）。不加其他媒体库。
- 模型类手写，字段名与 `services/api` 源码一致（`attachments[].blob.fileUrl` 等）。
- 预览页只初始化当前页播放器，翻页/关闭必须释放播放器（`dispose`）。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿。
- 联网命令（`flutter pub add` 等）必须带代理：`HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897`（本机 shell 无代理会卡死）。
- 用户可见文案中文。
- Commit message 英文（conventional style）。

## 文件结构（本次计划完整清单）

```
apps/mobile/
├── pubspec.yaml                                        # 改：+ video_player + just_audio；dev + mocktail_image_network
├── lib/features/moment/
│   ├── moment_models.dart                              # 改：+ MomentBlob / MomentAttachment；Moment.attachments
│   ├── moment_api.dart                                 # 改：+ createBlobAccessLink（返回 record）
│   ├── moment_providers.dart                           # 改：+ blobAccessServiceProvider + blobAccessUrlProvider
│   ├── blob_access.dart                                # 建：BlobAccessLink + BlobAccessService（纯 Dart，可单测）
│   ├── media_format.dart                               # 建：formatMediaDuration 纯函数
│   ├── media_preview_page.dart                         # 建：全屏 PageView 预览页
│   ├── widgets/
│   │   ├── attachment_grid.dart                        # 建：3 列网格 + 折叠 + 点击 push 预览页
│   │   ├── video_player_view.dart                      # 建：video_player + 手写控制条
│   │   ├── audio_player_bar.dart                       # 建：just_audio 播放条
│   │   ├── moment_card.dart                            # 改：正文下插入 AttachmentGrid
│   │   └── moment_detail_page.dart（在 features/moment/） # 改：正文下插入 AttachmentGrid
└── test/features/moment/
    ├── moment_models_test.dart                         # 改：+ attachments 解析测试
    ├── blob_access_test.dart                           # 建：缓存命中/过期刷新/失败回退
    ├── media_format_test.dart                          # 建：时长格式化
    └── attachment_grid_test.dart                       # 建：网格渲染 + 折叠 + 跳转预览
```

---

## Task 1: 依赖添加

**Files:**
- Modify: `apps/mobile/pubspec.yaml`

**Interfaces:**
- Produces: pubspec 依赖就绪，后续所有 task 可用 `video_player` / `just_audio`。

- [ ] **Step 1: 添加依赖（带代理，workdir `apps/mobile`）**

```sh
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter pub add video_player just_audio
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter pub add --dev mocktail_image_network
```
Expected: `video_player: ^2.13.x`、`just_audio: ^0.10.x` 写入 `dependencies`，`mocktail_image_network` 写入 `dev_dependencies`，解析成功。

- [ ] **Step 2: 验证解析**

Run（workdir `apps/mobile`，带代理）: `flutter pub get`
Expected: 无报错。

- [ ] **Step 3: 提交**

```bash
git add apps/mobile/pubspec.yaml apps/mobile/pubspec.lock
git commit -m "chore(mobile): add video_player and just_audio for moment attachments"
```

---

## Task 2: 附件模型层

**Files:**
- Modify: `apps/mobile/lib/features/moment/moment_models.dart`
- Modify: `apps/mobile/test/features/moment/moment_models_test.dart`

**Interfaces:**
- Produces: `MomentBlob`（字段：`id/originalName/mimeType/size/width/height/duration/fileUrl/createdAt`）、`MomentAttachment`（字段：`id/blobId/role/displayName/sortOrder/blob`；getter：`isImage/isVideo/isAudio/displayLabel`）、`Moment.attachments`（默认 `const []`）。Task 3~9 全部依赖。

- [ ] **Step 1: 写失败测试（追加到 `test/features/moment/moment_models_test.dart`）**

```dart
test('Moment.fromJson 解析内嵌 attachments', () {
  final m = Moment.fromJson({
    'id': 'm1',
    'text': '有附件的闪记',
    'attachments': [
      {
        'id': 'a1',
        'blobId': 'b1',
        'role': 'attachment',
        'displayName': '照片.jpg',
        'sortOrder': 0,
        'blob': {
          'id': 'b1',
          'originalName': '照片.jpg',
          'mimeType': 'image/jpeg',
          'size': 1024,
          'width': 100,
          'height': 200,
          'duration': null,
          'fileUrl': '/api/blobs/b1/file',
          'createdAt': 't',
        },
      },
      {
        'id': 'a2',
        'blobId': 'b2',
        'role': 'attachment',
        'sortOrder': 1,
        'blob': {
          'id': 'b2',
          'originalName': '视频.mp4',
          'mimeType': 'video/mp4',
          'size': 2048,
          'duration': 65000,
          'fileUrl': '/api/blobs/b2/file',
          'createdAt': 't',
        },
      },
    ],
    'comments': <Object>[],
    'commentCount': 0,
    'createdAt': 't',
    'updatedAt': 't',
  });
  expect(m.attachments, hasLength(2));
  final image = m.attachments[0];
  expect(image.isImage, isTrue);
  expect(image.isVideo, isFalse);
  expect(image.displayLabel, '照片.jpg');
  expect(image.blob.width, 100);
  expect(image.blob.height, 200);
  final video = m.attachments[1];
  expect(video.isVideo, isTrue);
  expect(video.isAudio, isFalse);
  expect(video.displayLabel, '视频.mp4');
  expect(video.blob.duration, 65000);
});

test('Moment.fromJson 缺 attachments 时默认为空', () {
  final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
  expect(m.attachments, isEmpty);
});
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/moment_models_test.dart`
Expected: FAIL（`attachments` getter 不存在 / `isImage` 不存在）。

- [ ] **Step 3: 实现模型（`lib/features/moment/moment_models.dart`）**

在 `MomentComment` 之后追加：

```dart
/// 附件背后的 blob 元数据（对齐 services/api 的 MomentBlobEntry）。
class MomentBlob {
  const MomentBlob({
    required this.id,
    required this.originalName,
    required this.mimeType,
    required this.size,
    this.width,
    this.height,
    this.duration,
    required this.fileUrl,
    required this.createdAt,
  });

  final String id;
  final String originalName;
  final String mimeType;
  final int size;
  final int? width;
  final int? height;

  /// 时长（毫秒），仅音视频有。
  final int? duration;

  /// 无签名直链（/api/blobs/:id/file），仅供回退；正常加载用签名链接。
  final String fileUrl;
  final String createdAt;

  factory MomentBlob.fromJson(Map<String, dynamic> json) => MomentBlob(
        id: json['id'] as String,
        originalName: json['originalName'] as String? ?? '',
        mimeType: json['mimeType'] as String,
        size: (json['size'] as num?)?.toInt() ?? 0,
        width: (json['width'] as num?)?.toInt(),
        height: (json['height'] as num?)?.toInt(),
        duration: (json['duration'] as num?)?.toInt(),
        fileUrl: json['fileUrl'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// Moment 附件（对齐 services/api 的 MomentAttachmentEntry）。
class MomentAttachment {
  const MomentAttachment({
    required this.id,
    required this.blobId,
    required this.role,
    this.displayName,
    required this.sortOrder,
    required this.blob,
  });

  final String id;
  final String blobId;
  final String role;
  final String? displayName;
  final int sortOrder;
  final MomentBlob blob;

  bool get isImage => blob.mimeType.startsWith('image/');
  bool get isVideo => blob.mimeType.startsWith('video/');
  bool get isAudio => blob.mimeType.startsWith('audio/');

  String get displayLabel => displayName ?? blob.originalName;

  factory MomentAttachment.fromJson(Map<String, dynamic> json) =>
      MomentAttachment(
        id: json['id'] as String,
        blobId: json['blobId'] as String,
        role: json['role'] as String? ?? 'attachment',
        displayName: json['displayName'] as String?,
        sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
        blob: MomentBlob.fromJson(json['blob'] as Map<String, dynamic>),
      );
}
```

`Moment` 类改造（构造器加字段 + fromJson 解析）：

```dart
class Moment {
  const Moment({
    required this.id,
    required this.text,
    this.attachments = const [],
    required this.comments,
    required this.commentCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String text;
  final List<MomentAttachment> attachments;
  final List<MomentComment> comments;
  final int commentCount;
  final String createdAt;
  final String updatedAt;

  factory Moment.fromJson(Map<String, dynamic> json) => Moment(
        id: json['id'] as String,
        text: json['text'] as String,
        attachments: (json['attachments'] as List<dynamic>? ?? const [])
            .map((e) => MomentAttachment.fromJson(e as Map<String, dynamic>))
            .toList(),
        comments: (json['comments'] as List<dynamic>? ?? const [])
            .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
            .toList(),
        commentCount: json['commentCount'] as int? ?? 0,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
```

- [ ] **Step 4: 运行确认通过**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/moment_models_test.dart`
Expected: PASS（4 个测试：原 2 + 新 2）。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/lib/features/moment/moment_models.dart apps/mobile/test/features/moment/moment_models_test.dart
git commit -m "feat(mobile): parse moment attachment models"
```

---

## Task 3: 签名链接缓存（BlobAccessService）

**Files:**
- Create: `apps/mobile/lib/features/moment/blob_access.dart`
- Create: `apps/mobile/test/features/moment/blob_access_test.dart`
- Modify: `apps/mobile/lib/features/moment/moment_api.dart`
- Modify: `apps/mobile/lib/features/moment/moment_providers.dart`

**Interfaces:**
- Produces:
  - `BlobAccessLink { url: String, expiresAt: DateTime, isExpired: bool }`
  - `BlobAccessService({ required Future<BlobAccessLink> Function(String blobId) fetchLink, required String Function(String blobId) directUrl })`，方法 `Future<String> resolve(String blobId)`、`void clear()`
  - `MomentApi.createBlobAccessLink(String blobId) → Future<({String url, DateTime expiresAt})>`
  - `blobAccessServiceProvider`、`blobAccessUrlProvider`（`FutureProvider.autoDispose.family<String, String>`）
  - Task 5/8 通过 `blobAccessUrlProvider(id)` 拿 URL。

- [ ] **Step 1: 写失败测试（`test/features/moment/blob_access_test.dart`）**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/blob_access.dart';

void main() {
  test('未过期缓存命中：第二次 resolve 不再调 fetchLink', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );

    final first = await service.resolve('b1');
    final second = await service.resolve('b1');
    expect(first, 'http://api/b1/signed');
    expect(second, first);
    expect(calls, 1);
  });

  test('过期链接被重新申请', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );
    await service.resolve('b1');
    await service.resolve('b1');
    expect(calls, 2);
  });

  test('fetchLink 抛错时回退直链，且不缓存', () async {
    var fail = true;
    final service = BlobAccessService(
      fetchLink: (id) async {
        if (fail) throw Exception('boom');
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );

    expect(await service.resolve('b1'), 'http://api/b1/direct');

    // 恢复后再次 resolve 走签名链接
    fail = false;
    expect(await service.resolve('b1'), 'http://api/b1/signed');
  });

  test('clear 清空缓存后重新申请', () async {
    var calls = 0;
    final service = BlobAccessService(
      fetchLink: (id) async {
        calls++;
        return BlobAccessLink(
          url: 'http://api/$id/signed',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
        );
      },
      directUrl: (id) => 'http://api/$id/direct',
    );
    await service.resolve('b1');
    service.clear();
    await service.resolve('b1');
    expect(calls, 2);
  });

  test('BlobAccessLink.isExpired 判断', () {
    expect(BlobAccessLink(url: 'u', expiresAt: DateTime.now().add(const Duration(minutes: 1))).isExpired, isFalse);
    expect(BlobAccessLink(url: 'u', expiresAt: DateTime.now().subtract(const Duration(minutes: 1))).isExpired, isTrue);
  });
}
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/blob_access_test.dart`
Expected: FAIL（`BlobAccessService` 不存在）。

- [ ] **Step 3: 实现 `lib/features/moment/blob_access.dart`**

```dart
/// 一条签名访问链接：URL + 过期时间（后端返回 unix 秒）。
class BlobAccessLink {
  const BlobAccessLink({required this.url, required this.expiresAt});

  final String url;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().isAfter(expiresAt);
}

/// 签名链接内存缓存：命中且未过期直接返回；过期重新申请；申请失败回退直链。
/// 纯 Dart，无 Riverpod/网络依赖，便于单测。
class BlobAccessService {
  BlobAccessService({required this.fetchLink, required this.directUrl});

  /// 申请签名链接（真实实现 = POST /api/blobs/:id/access-link）。
  final Future<BlobAccessLink> Function(String blobId) fetchLink;

  /// 失败回退的直链（真实实现 = baseUrl + /api/blobs/:id/file）。
  final String Function(String blobId) directUrl;

  final Map<String, BlobAccessLink> _cache = {};

  Future<String> resolve(String blobId) async {
    final cached = _cache[blobId];
    if (cached != null && !cached.isExpired) return cached.url;
    try {
      final link = await fetchLink(blobId);
      _cache[blobId] = link;
      return link.url;
    } catch (_) {
      // 失败不缓存：下次重建时重新尝试签名链接。
      return directUrl(blobId);
    }
  }

  void clear() => _cache.clear();
}
```

- [ ] **Step 4: `moment_api.dart` 加 `createBlobAccessLink`（返回 record，避免与 blob_access.dart 循环 import）**

```dart
/// 申请签名访问链接（1 小时），返回完整 URL 与过期时间。
/// 对齐 Web：凭证放 query，媒体组件（Image.network / video_player）无需带请求头。
Future<({String url, DateTime expiresAt})> createBlobAccessLink(
    String blobId) async {
  final data = await _client.postData('/api/blobs/$blobId/access-link',
      body: {'expiresInSeconds': 3600});
  final path = data['path'] as String;
  final expires = (data['expires'] as num).toInt();
  return (
    url: '${_client.baseUrl}$path',
    expiresAt: DateTime.fromMillisecondsSinceEpoch(expires * 1000),
  );
}
```

- [ ] **Step 5: `moment_providers.dart` 接线**

```dart
import 'blob_access.dart';

/// 签名链接缓存服务：内存缓存 + 过期刷新 + 失败回退直链。
final blobAccessServiceProvider = Provider<BlobAccessService>((ref) {
  final api = ref.watch(momentApiProvider);
  final client = ref.watch(apiClientProvider);
  return BlobAccessService(
    fetchLink: (blobId) async {
      final link = await api.createBlobAccessLink(blobId);
      return BlobAccessLink(url: link.url, expiresAt: link.expiresAt);
    },
    directUrl: (blobId) => '${client.baseUrl}/api/blobs/$blobId/file',
  );
});

/// 每个 blobId 的签名链接（autoDispose：瓦片重建时重新 resolve，
/// 命中 service 内存缓存则不发请求）。
final blobAccessUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, blobId) {
  return ref.watch(blobAccessServiceProvider).resolve(blobId);
});
```

- [ ] **Step 6: 运行确认通过**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/blob_access_test.dart`
Expected: PASS（5 个测试）。

- [ ] **Step 7: 提交**

```bash
git add apps/mobile/lib/features/moment/blob_access.dart apps/mobile/lib/features/moment/moment_api.dart apps/mobile/lib/features/moment/moment_providers.dart apps/mobile/test/features/moment/blob_access_test.dart
git commit -m "feat(mobile): add signed blob access link cache with refresh"
```

---

## Task 4: 时长格式化

**Files:**
- Create: `apps/mobile/lib/features/moment/media_format.dart`
- Create: `apps/mobile/test/features/moment/media_format_test.dart`

**Interfaces:**
- Produces: `String formatMediaDuration(Duration d)` → `m:ss`（≥1 小时 `h:mm:ss`）。Task 5/6 视频与音频共用。

- [ ] **Step 1: 写失败测试（`test/features/moment/media_format_test.dart`）**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/media_format.dart';

void main() {
  test('formatMediaDuration 格式化为 m:ss', () {
    expect(formatMediaDuration(Duration.zero), '0:00');
    expect(formatMediaDuration(const Duration(seconds: 5)), '0:05');
    expect(formatMediaDuration(const Duration(seconds: 65)), '1:05');
    expect(formatMediaDuration(const Duration(minutes: 12)), '12:00');
  });

  test('超过 1 小时格式化为 h:mm:ss', () {
    expect(formatMediaDuration(const Duration(hours: 1, minutes: 1, seconds: 1)),
        '1:01:01');
  });
}
```

- [ ] **Step 2: 运行确认失败**

Run: `flutter test test/features/moment/media_format_test.dart`
Expected: FAIL（函数不存在）。

- [ ] **Step 3: 实现 `lib/features/moment/media_format.dart`**

```dart
/// 时长 → `m:ss`，超过 1 小时 → `h:mm:ss`。视频/音频播放条共用。
String formatMediaDuration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final s = d.inSeconds.remainder(60);
  final ss = s.toString().padLeft(2, '0');
  if (h > 0) {
    return '$h:${m.toString().padLeft(2, '0')}:$ss';
  }
  return '$m:$ss';
}
```

- [ ] **Step 4: 运行确认通过**

Run: `flutter test test/features/moment/media_format_test.dart`
Expected: PASS（2 个测试）。

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/lib/features/moment/media_format.dart apps/mobile/test/features/moment/media_format_test.dart
git commit -m "feat(mobile): add media duration formatter"
```

---

## Task 5: 附件网格

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/attachment_grid.dart`
- Create: `apps/mobile/test/features/moment/attachment_grid_test.dart`

**Interfaces:**
- Consumes: `MomentAttachment`（Task 2）、`blobAccessUrlProvider`（Task 3）、`formatMediaDuration`（Task 4）。
- Produces: `AttachmentGrid({ required List<MomentAttachment> attachments })`——3 列正方形瓦片、>9 折叠「+N 更多」、点击瓦片 `Navigator.push` 打开 `MediaPreviewPage`（Task 8 提供）。

- [ ] **Step 1: 写失败测试（`test/features/moment/attachment_grid_test.dart`）**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';

MomentAttachment attachment({
  required String id,
  required String mimeType,
  String? name,
}) =>
    MomentAttachment(
      id: id,
      blobId: 'blob-$id',
      role: 'attachment',
      displayName: name,
      sortOrder: 0,
      blob: MomentBlob(
        id: 'blob-$id',
        originalName: name ?? '$id.bin',
        mimeType: mimeType,
        size: 1,
        fileUrl: '/api/blobs/blob-$id/file',
        createdAt: 't',
      ),
    );

Future<void> pumpGrid(WidgetTester tester, List<MomentAttachment> attachments) {
  return mockNetworkImagesFor(() async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        blobAccessUrlProvider.overrideWith((ref, blobId) async => 'http://media.test/$blobId'),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: AttachmentGrid(attachments: attachments),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
  });
}

void main() {
  testWidgets('图片瓦片渲染 Image', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'image/jpeg', name: 'x.jpg')]);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('视频瓦片显示播放图标', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'video/mp4', name: 'x.mp4')]);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
  });

  testWidgets('音频瓦片显示音乐图标与文件名', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'audio/mpeg', name: 'x.mp3')]);
    expect(find.byIcon(Icons.music_note), findsOneWidget);
  });

  testWidgets('超过 9 个附件折叠显示「+N 更多」，点击展开', (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final many = List.generate(11, (i) => attachment(id: 'a$i', mimeType: 'image/jpeg'));
    await pumpGrid(tester, many);
    expect(find.text('+3 更多'), findsOneWidget);
    expect(find.byType(Image), findsNWidgets(8));

    await tester.tap(find.text('+3 更多'));
    await tester.pumpAndSettle();
    expect(find.text('+3 更多'), findsNothing);
    expect(find.byType(Image), findsNWidgets(11));
  });
}
```

- [ ] **Step 2: 运行确认失败**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/attachment_grid_test.dart`
Expected: FAIL（`AttachmentGrid` 不存在）。

- [ ] **Step 3: 实现 `lib/features/moment/widgets/attachment_grid.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../media_format.dart';
import '../media_preview_page.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 朋友圈式附件 3 列网格：图片缩略图 / 视频 ▶ / 音频图标。
/// 超过 9 个折叠显示前 8 个 +「+N 更多」；点击瓦片进入全屏预览。
class AttachmentGrid extends ConsumerStatefulWidget {
  const AttachmentGrid({super.key, required this.attachments});

  final List<MomentAttachment> attachments;

  @override
  ConsumerState<AttachmentGrid> createState() => _AttachmentGridState();
}

class _AttachmentGridState extends ConsumerState<AttachmentGrid> {
  static const _previewCount = 8;

  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final sorted = [...widget.attachments]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final needsExpand = sorted.length > _previewCount + 1;
    final display = needsExpand && !_expanded
        ? sorted.take(_previewCount).toList()
        : sorted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          children: [
            for (final a in display) _AttachmentTile(attachment: a),
            if (needsExpand && !_expanded)
              _MoreTile(
                count: sorted.length - _previewCount,
                onTap: () => setState(() => _expanded = true),
              ),
          ],
        ),
      ],
    );
  }
}

class _AttachmentTile extends ConsumerWidget {
  const _AttachmentTile({required this.attachment});

  final MomentAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(blobAccessUrlProvider(attachment.blob.id));
    final scheme = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => MediaPreviewPage(
              attachments: [attachment],
              initialIndex: 0,
            ),
          )),
          child: url.when(
            loading: () => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: const Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
            error: (_, _) => const _FileTile(icon: Icons.broken_image_outlined),
            data: (u) => _tileBody(context, u),
          ),
        ),
      ),
    );
  }

  Widget _tileBody(BuildContext context, String url) {
    if (attachment.isImage) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) =>
            const _FileTile(icon: Icons.broken_image_outlined),
      );
    }
    if (attachment.isVideo) {
      return _FileTile(
        icon: Icons.play_circle_outline,
        size: 36,
        footer: attachment.blob.duration != null
            ? formatMediaDuration(
                Duration(milliseconds: attachment.blob.duration!))
            : null,
      );
    }
    if (attachment.isAudio) {
      return _FileTile(
        icon: Icons.music_note,
        footer: attachment.displayLabel,
      );
    }
    return _FileTile(icon: Icons.insert_drive_file_outlined);
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({required this.icon, this.size = 28, this.footer});

  final IconData icon;
  final double size;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      alignment: Alignment.center,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: size, color: scheme.onSurfaceVariant),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
              child: Text(
                footer!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: Material(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Center(
            child: Text(
              '+$count 更多',
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
          ),
        ),
      ),
    );
  }
}
```

> 说明：瓦片目前 push 单附件预览（`attachments: [attachment]`），Task 8 完成后改为传入整组 + 正确 index。Task 5 的测试只测网格渲染，不受影响。

- [ ] **Step 4: 运行确认通过**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/attachment_grid_test.dart`
Expected: PASS（4 个测试）。`MediaPreviewPage` 尚未实现会编译失败——若失败，先跳到 Task 8 创建最小可编译的 `media_preview_page.dart`（仅 Scaffold 黑底 + 计数文本），再回来跑本任务测试。或者按顺序执行：本任务先建一个占位 `media_preview_page.dart`（Task 8 会替换）：

```dart
// lib/features/moment/media_preview_page.dart（占位，Task 8 替换）
import 'package:flutter/material.dart';
import 'moment_models.dart';

class MediaPreviewPage extends StatelessWidget {
  const MediaPreviewPage({super.key, required this.attachments, this.initialIndex = 0});
  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: SizedBox.shrink());
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add apps/mobile/lib/features/moment/widgets/attachment_grid.dart apps/mobile/test/features/moment/attachment_grid_test.dart apps/mobile/lib/features/moment/media_preview_page.dart
git commit -m "feat(mobile): add moment attachment grid with collapse"
```

---

## Task 6: 视频播放器（手写控制条）

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/video_player_view.dart`

**Interfaces:**
- Consumes: `formatMediaDuration`（Task 4）。
- Produces: `VideoPlayerView({ required String url })`——自动初始化、点按切换控制条、播放/暂停 + 进度条 + 时长 + 全屏；`dispose` 释放 controller 并恢复竖屏。Task 8 使用。视频播放依赖平台插件，**不写 widget 测试**（真机验证）。

- [ ] **Step 1: 实现 `lib/features/moment/widgets/video_player_view.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import '../media_format.dart';

/// 视频播放器（video_player）+ 手写控制条：点按切换控制条显隐，
/// 播放/暂停 + 进度 Slider + 已播/总时长 + 全屏横竖屏切换。
class VideoPlayerView extends StatefulWidget {
  const VideoPlayerView({super.key, required this.url});

  final String url;

  @override
  State<VideoPlayerView> createState() => _VideoPlayerViewState();
}

class _VideoPlayerViewState extends State<VideoPlayerView> {
  late VideoPlayerController _controller;
  bool _initialized = false;
  bool _loadFailed = false;
  bool _controlsVisible = true;
  bool _dragging = false;
  double _dragValue = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..addListener(_onTick);
    try {
      await _controller.initialize();
      if (!mounted) return;
      setState(() {
        _initialized = true;
        _loadFailed = false;
      });
      _controller.play();
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadFailed = true);
    }
  }

  void _onTick() {
    if (mounted && !_dragging) setState(() {});
  }

  void _togglePlay() {
    if (!_initialized) return;
    _controller.value.isPlaying ? _controller.pause() : _controller.play();
  }

  void _toggleFullscreen() {
    if (_controller.value.aspectRatio == 0) return;
    if (_isLandscape) {
      SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    }
  }

  bool get _isLandscape {
    final o = MediaQuery.orientationOf(context);
    return o == Orientation.landscape;
  }

  @override
  void dispose() {
    _controller.removeListener(_onTick);
    _controller.dispose();
    // 退出页面恢复竖屏（若用户切过全屏）。
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadFailed) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            const Text('视频加载失败', style: TextStyle(color: Colors.white70)),
            TextButton(
              onPressed: () {
                setState(() => _loadFailed = false);
                _load();
              },
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }
    if (!_initialized) {
      return const Center(
        child: SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      );
    }

    final ratio = _controller.value.aspectRatio == 0
        ? 16 / 9
        : _controller.value.aspectRatio;
    return Center(
      child: AspectRatio(
        aspectRatio: ratio,
        child: GestureDetector(
          onTap: () => setState(() => _controlsVisible = !_controlsVisible),
          child: Stack(
            alignment: Alignment.center,
            children: [
              VideoPlayer(_controller),
              // 点按切换控制条显隐
              if (_controlsVisible) ...[
                if (_controller.value.isPlaying)
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 72,
                    child: _fadeBar(gradient: [Colors.black54, Colors.transparent]),
                  ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 72,
                  child: _fadeBar(gradient: [Colors.transparent, Colors.black54]),
                ),
                Center(child: IconButton(
                  iconSize: 56,
                  color: Colors.white,
                  icon: Icon(
                    _controller.value.isPlaying
                        ? Icons.pause_circle_outline
                        : Icons.play_circle_outline,
                  ),
                  onPressed: _togglePlay,
                )),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _fadeBar({required List<Color> gradient}) {
    final position = _controller.value.position;
    final duration = _controller.value.duration;
    final maxMs = duration.inMilliseconds.toDouble().clamp(1, double.infinity);
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: gradient,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Text(formatMediaDuration(position),
                  style: const TextStyle(color: Colors.white, fontSize: 12)),
              Expanded(
                child: SliderTheme(
                  data: SliderThemeData(
                    trackHeight: 2,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 6),
                    overlayShape:
                        const RoundSliderOverlayShape(overlayRadius: 12),
                  ),
                  child: Slider(
                    value: _dragging
                        ? _dragValue
                        : position.inMilliseconds.clamp(0, maxMs).toDouble(),
                    max: maxMs,
                    onChanged: (v) => setState(() {
                      _dragging = true;
                      _dragValue = v;
                    }),
                    onChangeEnd: (v) {
                      _controller.seekTo(Duration(milliseconds: v.round()));
                      setState(() => _dragging = false);
                    },
                  ),
                ),
              ),
              Text(formatMediaDuration(duration),
                  style: const TextStyle(color: Colors.white, fontSize: 12)),
              IconButton(
                iconSize: 20,
                color: Colors.white,
                tooltip: _isLandscape ? '退出全屏' : '全屏',
                icon: Icon(_isLandscape
                    ? Icons.fullscreen_exit
                    : Icons.fullscreen),
                onPressed: _toggleFullscreen,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

> 注意：`_fadeBar` 顶部渐变条只在播放时显示（播放后控制条自动隐藏的视觉过渡，可简化——若嫌复杂，两条渐变条都直接保留，可接受）。

- [ ] **Step 2: 编译检查**

Run（workdir `apps/mobile`）: `flutter analyze`
Expected: No issues found。

- [ ] **Step 3: 提交**

```bash
git add apps/mobile/lib/features/moment/widgets/video_player_view.dart
git commit -m "feat(mobile): add video player view with custom controls"
```

---

## Task 7: 音频播放条

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/audio_player_bar.dart`

**Interfaces:**
- Consumes: `formatMediaDuration`（Task 4）。
- Produces: `AudioPlayerBar({ required String url, required String title })`——just_audio 播放条：播放/暂停 + 进度 + 时长 + 文件名；`dispose` 释放 player。Task 8 使用。依赖平台插件，**不写 widget 测试**（真机验证）。

- [ ] **Step 1: 实现 `lib/features/moment/widgets/audio_player_bar.dart`**

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import '../media_format.dart';

/// 音频播放条（just_audio）：播放/暂停 + 进度 Slider + 时长 + 文件名。
class AudioPlayerBar extends StatefulWidget {
  const AudioPlayerBar({super.key, required this.url, required this.title});

  final String url;
  final String title;

  @override
  State<AudioPlayerBar> createState() => _AudioPlayerBarState();
}

class _AudioPlayerBarState extends State<AudioPlayerBar> {
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration?>? _durationSub;
  StreamSubscription<PlayerState>? _stateSub;
  bool _loading = true;
  bool _loadFailed = false;
  bool _dragging = false;
  double _dragValue = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    _positionSub = _player.positionStream.listen((_) {
      if (mounted && !_dragging) setState(() {});
    });
    _durationSub = _player.durationStream.listen((_) {
      if (mounted) setState(() {});
    });
    _stateSub = _player.playerStateStream.listen((_) {
      if (mounted) setState(() {});
    });
    try {
      await _player.setUrl(widget.url);
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() {
        _loading = false;
        _loadFailed = true;
      });
    }
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _durationSub?.cancel();
    _stateSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (_loadFailed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('音频加载失败',
              style: TextStyle(color: Colors.white70)),
          TextButton(
            onPressed: _load,
            child: const Text('重试'),
          ),
        ],
      );
    }
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 32,
          height: 32,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      );
    }

    final duration = _player.duration;
    final maxMs = (duration?.inMilliseconds ?? 0).toDouble().clamp(1, double.infinity);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: Text(
            widget.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 15),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              iconSize: 48,
              color: Colors.white,
              icon: Icon(_player.playing ? Icons.pause_circle : Icons.play_circle),
              onPressed: () {
                if (_player.playing) {
                  _player.pause();
                } else {
                  _player.play();
                }
              },
            ),
            SizedBox(
              width: 220,
              child: SliderTheme(
                data: SliderThemeData(
                  trackHeight: 2,
                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                ),
                child: Slider(
                  value: _dragging
                      ? _dragValue
                      : _player.position.inMilliseconds.clamp(0, maxMs).toDouble(),
                  max: maxMs,
                  onChanged: (v) => setState(() {
                    _dragging = true;
                    _dragValue = v;
                  }),
                  onChangeEnd: (v) {
                    _player.seek(Duration(milliseconds: v.round()));
                    setState(() => _dragging = false);
                  },
                ),
              ),
            ),
          ],
        ),
        Text(
          '${formatMediaDuration(_player.position)} / ${formatMediaDuration(duration ?? Duration.zero)}',
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}
```

> 说明：`_player.position` / `_player.playing` 在 `setState` 时重建读取（三个 Stream 订阅驱动刷新），避免多层 StreamBuilder 嵌套。

- [ ] **Step 2: 编译检查**

Run（workdir `apps/mobile`）: `flutter analyze`
Expected: No issues found。

- [ ] **Step 3: 提交**

```bash
git add apps/mobile/lib/features/moment/widgets/audio_player_bar.dart
git commit -m "feat(mobile): add audio player bar with just_audio"
```

---

## Task 8: 全屏预览页

**Files:**
- Modify: `apps/mobile/lib/features/moment/media_preview_page.dart`（替换 Task 5 占位）
- Modify: `apps/mobile/lib/features/moment/widgets/attachment_grid.dart`（瓦片 push 整组附件 + 正确 index）

**Interfaces:**
- Consumes: `VideoPlayerView`（Task 6）、`AudioPlayerBar`（Task 7）、`blobAccessUrlProvider`（Task 3）。
- Produces: `MediaPreviewPage({ required List<MomentAttachment> attachments, int initialIndex = 0 })`——黑底全屏 `PageView`，顶部 `1/N` + 关闭按钮。卡片/详情页（Task 9）与网格共用。

- [ ] **Step 1: 实现 `media_preview_page.dart`（替换占位）**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/audio_player_bar.dart';
import 'widgets/video_player_view.dart';

/// 全屏媒体预览（朋友圈样式）：黑底 PageView 左右滑动切换，
/// 图片可捏合缩放，视频/音频可播放。只构建当前页 → 翻页自动释放上一页播放器。
class MediaPreviewPage extends StatefulWidget {
  const MediaPreviewPage({
    super.key,
    required this.attachments,
    this.initialIndex = 0,
  });

  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  State<MediaPreviewPage> createState() => _MediaPreviewPageState();
}

class _MediaPreviewPageState extends State<MediaPreviewPage> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    // 空列表先兜底（grid 只会从非空附件进入，防御性处理）
    _index = widget.attachments.isEmpty
        ? 0
        : widget.initialIndex.clamp(0, widget.attachments.length - 1);
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.attachments.isEmpty) {
      return const Scaffold(backgroundColor: Colors.black);
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.attachments.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) =>
                _PreviewItem(attachment: widget.attachments[i]),
          ),
          // 顶部：关闭 + 计数
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    tooltip: '关闭',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  Expanded(
                    child: Center(
                      child: Text(
                        '${_index + 1} / ${widget.attachments.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewItem extends ConsumerWidget {
  const _PreviewItem({required this.attachment});

  final MomentAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(blobAccessUrlProvider(attachment.blob.id));
    return url.when(
      loading: () => const Center(
        child: SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      ),
      error: (err, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            const Text('加载失败', style: TextStyle(color: Colors.white70)),
            TextButton(
              onPressed: () => ref.invalidate(blobAccessUrlProvider(attachment.blob.id)),
              child: const Text('重试', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
      data: (u) {
        if (attachment.isImage) {
          return Center(
            child: InteractiveViewer(
              maxScale: 4,
              child: Image.network(
                u,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Icon(
                    Icons.broken_image_outlined,
                    color: Colors.white54,
                    size: 48),
              ),
            ),
          );
        }
        if (attachment.isVideo) {
          return VideoPlayerView(url: u);
        }
        if (attachment.isAudio) {
          return Center(
            child: AudioPlayerBar(url: u, title: attachment.displayLabel),
          );
        }
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.insert_drive_file_outlined,
                  color: Colors.white54, size: 48),
              const SizedBox(height: 8),
              Text(attachment.displayLabel,
                  style: const TextStyle(color: Colors.white70)),
            ],
          ),
        );
      },
    );
  }
}
```

- [ ] **Step 2: 网格瓦片改为 push 整组附件**

`attachment_grid.dart` 中 `_AttachmentTile` 需要拿到整组附件与自己的序号。把 `AttachmentGrid.build` 里的瓦片构造改为：

```dart
for (final (i, a) in display.indexed)
  _AttachmentTile(
    attachment: a,
    all: sorted,
    index: i,
  ),
```

`_AttachmentTile` 改为：

```dart
class _AttachmentTile extends ConsumerWidget {
  const _AttachmentTile({
    required this.attachment,
    required this.all,
    required this.index,
  });

  final MomentAttachment attachment;
  final List<MomentAttachment> all;
  final int index;
  ...
  onTap: () => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => MediaPreviewPage(attachments: all, initialIndex: index),
  )),
```

（其余部分不变。）

- [ ] **Step 3: 运行全部 moment 相关测试**

Run（workdir `apps/mobile`）:
`flutter test test/features/moment/`
Expected: 全部 PASS（含 Task 5 的网格测试）。

- [ ] **Step 4: 提交**

```bash
git add apps/mobile/lib/features/moment/media_preview_page.dart apps/mobile/lib/features/moment/widgets/attachment_grid.dart
git commit -m "feat(mobile): add fullscreen media preview page with swipe"
```

---

## Task 9: 卡片与详情页接线

**Files:**
- Modify: `apps/mobile/lib/features/moment/widgets/moment_card.dart`
- Modify: `apps/mobile/lib/features/moment/moment_detail_page.dart`

**Interfaces:**
- Consumes: `AttachmentGrid`（Task 5）。
- Produces: 列表卡片与详情页显示附件网格（正文下、时间行上）。

- [ ] **Step 1: `moment_card.dart` 插入网格**

在「全文/收起」块之后、时间行（`const SizedBox(height: 4)` + Row）之前插入：

```dart
if (moment.attachments.isNotEmpty) ...[
  const SizedBox(height: 8),
  AttachmentGrid(attachments: moment.attachments),
],
```

并在文件头 import 附件网格：`import 'attachment_grid.dart';`

- [ ] **Step 2: `moment_detail_page.dart` 插入网格**

在 `ListView` 的 TextField 之后、时间 Text 之前插入：

```dart
if (moment.attachments.isNotEmpty) ...[
  const SizedBox(height: 8),
  AttachmentGrid(attachments: moment.attachments),
],
```

并 import：`import 'widgets/attachment_grid.dart';`

- [ ] **Step 3: 运行测试确认无回归**

Run（workdir `apps/mobile`）: `flutter test test/features/moment/`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/mobile/lib/features/moment/widgets/moment_card.dart apps/mobile/lib/features/moment/moment_detail_page.dart
git commit -m "feat(mobile): show attachment grid in moment card and detail"
```

---

## Task 10: 全量验证 + 收尾

**Files:**
- 无（验证 + 记忆落盘）

- [ ] **Step 1: 全量门禁**

Run（workdir `apps/mobile`）:
```sh
flutter analyze
flutter test
```
Expected: analyze 无告警；test 全绿（36+ 个用例，含新增）。

- [ ] **Step 2: 真机验证清单（用户协作）**

Web 端先上传 1+ 张图片、1 个视频、1 段音频（已有数据则跳过）→ 手机跑：

```sh
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000
```

逐项确认：
1. 列表卡片附件网格：图片缩略图正常、视频显示 ▶、音频显示图标+文件名。
2. 点击图片 → 全屏预览，左右滑动切换，图片可捏合缩放。
3. 视频页：自动播放、控制条播放/暂停、进度拖动、时长、全屏横屏。
4. 音频页：播放/暂停、进度、时长、文件名。
5. 详情页附件网格与预览。
6. 连接弱网/过期后重进（等待 1 小时或重启 app）签名链接刷新正常。

- [ ] **Step 3: 项目记忆落盘（remember-worklog skill）**

按 `.opencode/skills/remember-worklog/SKILL.md` 写当天 worklog（`2026-08-08-flutter-moment-attachments-preview.md`），内容：实现内容、真机验证结果、坑（如有）、「下一个 session 提示」。
