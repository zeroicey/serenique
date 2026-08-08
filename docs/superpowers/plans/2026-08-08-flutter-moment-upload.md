# Flutter 移动端 — Moment 附件上传（发布）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile` 的 Moment 支持发布带附件：右上角 + 短按弹出「拍摄/选文件/从手机相册选择/取消」底部弹层，长按直进发布页；发布页内可继续添加/删除附件（图/视频/音频，数量不限）+ 写文字，发表时逐个上传 blob 再创建 Moment（必须带文字）。

**Architecture:** 对齐 Web `useCreateMomentWithMedia` 编排：`uploadBlob(file)` 逐个上传 → `createMoment({text, attachments:[{blobId, displayName, sortOrder}]})`。短按/长按交互：`GestureDetector` 同时挂 `onTap`（弹层）与 `onLongPress`（直进发布页）。已选附件用 autoDispose Riverpod provider 在弹层与发布页间传递（文件对象不能走路由参数）。

**Tech Stack:** Flutter / Dart；新增 `image_picker ^1.2.3`（拍摄：拍照+录像；相册：多选图/视频）、`file_picker ^11.0.3`（选文件：custom 限定 image/video/audio）。iOS Info.plist 加相机/相册/麦克风权限描述。

## Global Constraints

（来自 spec：`.ai/architecture/2026-08-08-flutter-moment-upload-design.md`，违反即失败）

- 后端契约：`POST /api/blobs/upload`（multipart `file`）→ BlobEntry；`POST /api/moments` `{text 必填 ≥1 字, attachments:[{blobId, displayName, sortOrder}]}`。**纯附件不允许**：text 为空必须拦截并提示「内容不能为空」。
- 短按右上角 + → 底部弹层四选项：拍摄 / 选文件 / 从手机相册选择 / 取消；**长按** → 直接进发布页（无附件）。
- 选完附件自动进入发布页；发布页可**继续添加**（再次弹层）与**删除**附件，数量不限。
- 上传/创建失败：snackbar 提示 + **已选附件与正文保留**，可重试；发表中禁用按钮 + spinner。
- 附件类型限定：图片 / 视频 / 音频（file_picker `FileType.custom` 且 `allowedExtensions` 不设，用 `allowedExtensions` 不支持 mime → 用 `FileType.media`；若 `FileType.media` 不可用则 custom + 客户端按扩展名过滤）。**以最终实现可编译且三种类型都能选到为准**。
- 附件缩略图：图片 `Image.file`；视频灰底 + ▶ + 时长；音频图标 + 文件名；瓦片右上角 ✕ 删除；末尾「+」瓦片继续添加。
- 纯文字路径（长按进入、发布页不加附件）：行为与现状完全一致（`create(text)`）。
- 用户可见文案中文；上传中不显示进度条（v1 无）。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿（当前基线 125/125）。
- 联网命令必须带代理：`HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897`（pub.dev 直连当前可达，失败时用代理）。
- Commit message 英文（conventional style）。

---

## 文件结构

```
apps/mobile/
├── pubspec.yaml                                          # 改：+ image_picker ^1.2.3 + file_picker ^11.0.3
├── ios/Runner/Info.plist                                 # 改：+ NSCameraUsageDescription/NSPhotoLibraryUsageDescription/NSMicrophoneUsageDescription
├── lib/core/network/api_client.dart                      # 改：+ postMultipart(path, bytes, filename, mimeType)
├── lib/features/moment/
│   ├── moment_api.dart                                   # 改：+ uploadBlob + create 支持 attachments
│   ├── moment_providers.dart                             # 改：+ pickedAttachmentsProvider（autoDispose 传递）+ createWithMedia
│   ├── moment_create_page.dart                           # 改：附件网格 + 继续添加 + 删除 + 发表编排
│   ├── widgets/attachment_picker_sheet.dart              # 新：底部弹层（拍摄/选文件/相册/取消）
│   └── widgets/local_attachment_grid.dart                # 新：本地附件缩略图网格（删除 + 「+」）
├── app_shell.dart                                        # 改：右上角 + 短按弹层 / 长按直进
└── test/features/moment/
    ├── attachment_picker_sheet_test.dart                 # 新
    ├── local_attachment_grid_test.dart                   # 新
    ├── moment_create_page_test.dart                      # 改：附件发表编排
    └── moment_api_test.dart                              # 改：create 带 attachments
```

依赖链：Task 1（依赖/权限）→ Task 2（API 层 upload+create）→ Task 3（picker 弹层）→ Task 4（本地附件网格）→ Task 5（发布页编排）→ Task 6（app_shell 短按/长按接线）。

---

### Task 1: 依赖 + iOS 权限

**Files:**
- Modify: `apps/mobile/pubspec.yaml`
- Modify: `apps/mobile/ios/Runner/Info.plist`

**Interfaces:**
- Produces: `image_picker`/`file_picker` 可用；相机/相册/麦克风权限描述就位

- [ ] **Step 1: 添加依赖**

```bash
cd apps/mobile && flutter pub add image_picker:^1.2.3 file_picker:^11.0.3
```

- [ ] **Step 2: Info.plist 加权限描述**

读 `ios/Runner/Info.plist`，在 `<dict>` 内追加：

```xml
	<key>NSCameraUsageDescription</key>
	<string>拍摄照片或视频用于闪记附件</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>从相册选择图片或视频作为闪记附件</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>拍摄视频时录制声音</string>
```

- [ ] **Step 3: 验证编译与基线**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test 2>&1 | tail -1`
Expected: `No issues found` + `All tests passed!`（125/125）

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/pubspec.yaml apps/mobile/pubspec.lock apps/mobile/ios/Runner/Info.plist
git commit -m "chore(mobile): add image_picker and file_picker with iOS permissions"
```

---

### Task 2: API 层 — uploadBlob + create 带附件

**Files:**
- Modify: `apps/mobile/lib/core/network/api_client.dart`
- Modify: `apps/mobile/lib/features/moment/moment_api.dart`
- Modify: `apps/mobile/lib/features/moment/moment_providers.dart`
- Test: `apps/mobile/test/core/network/api_client_test.dart`、`apps/mobile/test/features/moment/moment_api_test.dart`

**Interfaces:**
- Consumes: `ApiClient`（现有 `postData` 等）
- Produces:
  - `Future<dynamic> postMultipart(String path, {required Uint8List bytes, required String filename, required String mimeType})`（ApiClient，dio FormData）
  - `Future<MomentBlob> uploadBlob(Uint8List bytes, {required String filename, required String mimeType})`（MomentApi，返回 BlobEntry 的移动端模型）
  - `Future<Moment> create(String text, {List<MomentAttachmentInput> attachments = const []})`（MomentApi）
  - `class MomentAttachmentInput { final String blobId; final String? displayName; final int sortOrder; }`（moment_models.dart）
  - `Future<Moment> createWithMedia(String text, List<({Uint8List bytes, String filename, String mimeType})> files)`（MomentActions，逐个 uploadBlob → create）

- [ ] **Step 1: 写失败测试（api_client multipart）**

追加到 `test/core/network/api_client_test.dart`（参考现有 `_FakeAdapter` 模式，检查请求体含 multipart 边界与文件名）：

```dart
  test('postMultipart 发送 multipart/form-data 并解包响应', () async {
    final captured = <String>[];
    final adapter = _RecordingAdapter((options) {
      captured.add(options.contentType?.mimeType ?? '');
      captured.add(options.contentType?.boundary != null ? 'has-boundary' : 'no-boundary');
      return jsonEncode({'success': true, 'message': 'ok', 'data': {'id': 'b1'}});
    });
    final client = ApiClient(baseUrl: 'https://api.test', tokenReader: () => null, dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter);
    final data = await client.postMultipart('/api/blobs/upload',
        bytes: Uint8List.fromList([1, 2, 3]), filename: 'a.jpg', mimeType: 'image/jpeg');
    expect((data as Map)['id'], 'b1');
    expect(captured[0], 'multipart/form-data');
    expect(captured[1], 'has-boundary');
  });
```

（`_RecordingAdapter`：仿照现有 `_FakeAdapter`，fetch 时把 `options` 传给回调并返回构造的 ResponseBody。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/core/network/api_client_test.dart 2>&1 | tail -3`
Expected: FAIL（`postMultipart` 不存在）

- [ ] **Step 3: 实现 postMultipart**

`api_client.dart` 增加：

```dart
  /// multipart 文件上传（dio FormData + MultipartFile，bytes 已在内存）。
  Future<dynamic> postMultipart(
    String path, {
    required Uint8List bytes,
    required String filename,
    required String mimeType,
  }) {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename, contentType: DioMediaType.parse(mimeType)),
    });
    return _guard(_dio.post(path, data: form));
  }
```

import 补 `dart:typed_data`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter test test/core/network/api_client_test.dart 2>&1 | tail -1`
Expected: `All tests passed!`

- [ ] **Step 5: 写失败测试（moment_api upload+create）**

追加到 `test/features/moment/moment_api_test.dart`（复用该文件已有的 `_FakeAdapter` + `_client` helper）：

```dart
  test('uploadBlob 走 multipart 并解析 BlobEntry', () async {
    var sentForm = false;
    final adapter = _RecordingAdapter((options) => jsonEncode({
          'success': true, 'message': 'ok',
          'data': {
            'id': 'b1', 'originalName': 'a.jpg', 'mimeType': 'image/jpeg',
            'size': 3, 'checksum': 'x', 'metadata': {}, 'width': 1, 'height': 1,
            'duration': null, 'createdAt': 't',
          },
        }));
    final client = ApiClient(baseUrl: 'https://api.test', tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter);
    final blob = await MomentApi(client).uploadBlob(
        Uint8List.fromList([1, 2, 3]), filename: 'a.jpg', mimeType: 'image/jpeg');
    expect(blob.id, 'b1');
    expect(blob.mimeType, 'image/jpeg');
  });

  test('create 带 attachments 时请求体包含 blobId/displayName/sortOrder', () async {
    final adapter = _RecordingAdapter((options) => jsonEncode({
          'success': true, 'message': 'ok',
          'data': {'id': 'm1', 'text': '看图', 'attachments': [], 'comments': [], 'commentCount': 0, 'createdAt': 't', 'updatedAt': 't'},
        }));
    final client = ApiClient(baseUrl: 'https://api.test', tokenReader: () => null,
        dio: Dio(BaseOptions(baseUrl: 'https://api.test'))..httpClientAdapter = adapter);
    await MomentApi(client).create('看图', attachments: [
      MomentAttachmentInput(blobId: 'b1', displayName: 'a.jpg', sortOrder: 0),
    ]);
    final body = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
    expect(body['text'], '看图');
    expect((body['attachments'] as List).single, {'blobId': 'b1', 'displayName': 'a.jpg', 'sortOrder': 0});
  });
```

（`_RecordingAdapter` 需要记录 `options.data`（String）供 `lastBody` 读取——dio 的 `data` 参数在 JSON 请求时是 Map，这里 JSON 请求需 `jsonEncode` 序列化；实现时保证 `lastBody` 拿到原始 body 字符串。）

- [ ] **Step 6: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/moment_api_test.dart 2>&1 | tail -3`
Expected: FAIL（`uploadBlob`/`MomentAttachmentInput`/`create` 签名不匹配）

- [ ] **Step 7: 实现**

`moment_models.dart` 增加：

```dart
/// 创建 Moment 时的附件输入（对齐 services/api MomentAttachmentInputSchema）。
class MomentAttachmentInput {
  const MomentAttachmentInput({required this.blobId, this.displayName, required this.sortOrder});

  final String blobId;
  final String? displayName;
  final int sortOrder;

  Map<String, dynamic> toJson() => {
        'blobId': blobId,
        if (displayName != null) 'displayName': displayName,
        'sortOrder': sortOrder,
      };
}
```

`moment_api.dart`：

```dart
  Future<MomentBlob> uploadBlob(Uint8List bytes, {required String filename, required String mimeType}) async {
    final data = await _client.postMultipart('/api/blobs/upload',
        bytes: bytes, filename: filename, mimeType: mimeType);
    return MomentBlob.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> create(String text, {List<MomentAttachmentInput> attachments = const []}) async {
    final data = await _client.postData('/api/moments', body: {
      'text': text,
      if (attachments.isNotEmpty)
        'attachments': attachments.map((a) => a.toJson()).toList(),
    });
    return Moment.fromJson(data as Map<String, dynamic>);
  }
```

`moment_providers.dart` `MomentActions`：

```dart
  /// 上传编排：逐个 uploadBlob → createMoment（对齐 Web useCreateMomentWithMedia）。
  /// 任一步失败抛错，由页面保留已选附件供重试。
  Future<Moment> createWithMedia(
    String text,
    List<({Uint8List bytes, String filename, String mimeType})> files,
  ) async {
    final blobs = <String>[];
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final blob = await _api.uploadBlob(f.bytes, filename: f.filename, mimeType: f.mimeType);
      blobs.add(blob.id);
    }
    final created = await _api.create(
      text,
      attachments: [
        for (var i = 0; i < blobs.length; i++)
          MomentAttachmentInput(blobId: blobs[i], displayName: files[i].filename, sortOrder: i),
      ],
    );
    _ref.invalidate(momentListProvider);
    return created;
  }
```

（`pickedAttachmentsProvider` 在 Task 3 定义——`PickedAttachment` 模型归属 Task 3，避免跨任务未定义引用。）

- [ ] **Step 8: 跑测试确认通过**

Run: `cd apps/mobile && flutter test test/features/moment/moment_api_test.dart 2>&1 | tail -1`
Expected: `All tests passed!`

- [ ] **Step 9: 全量验证 + Commit**

```bash
cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test 2>&1 | tail -1
git add lib/core/network/api_client.dart lib/features/moment/moment_models.dart lib/features/moment/moment_api.dart lib/features/moment/moment_providers.dart test/core/network/api_client_test.dart test/features/moment/moment_api_test.dart
git commit -m "feat(mobile): blob upload and moment create with attachments"
```

---

### Task 3: AttachmentPickerSheet 底部弹层

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/attachment_picker_sheet.dart`
- Create: `apps/mobile/lib/features/moment/models/picked_attachment.dart`（或并入 `moment_models.dart`）
- Test: `apps/mobile/test/features/moment/attachment_picker_sheet_test.dart`

**Interfaces:**
- Consumes: `image_picker`/`file_picker`（Task 1）；`pickedAttachmentsProvider`（Task 2 占位）
- Produces:
  - `enum AttachmentPickSource { camera, file, gallery }`
  - `class PickedAttachment { final Uint8List bytes; final String filename; final String mimeType; final String? localPath; final int? durationMs; }`（localPath 供本地缩略图显示，bytes 供上传）
  - `Future<List<PickedAttachment>?> showAttachmentPickerSheet(BuildContext context)` → 返回选中的附件列表（取消 = null）；内部：弹层四选项 → 调用 picker → 读取文件 bytes → 返回

- [ ] **Step 1: 写失败测试**

`test/features/moment/attachment_picker_sheet_test.dart`：

```dart
void main() {
  testWidgets('弹层渲染四个选项', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Builder(builder: (ctx) => Center(
      child: ElevatedButton(onPressed: () => showAttachmentPickerSheet(ctx), child: const Text('open')),
    )))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('拍摄'), findsOneWidget);
    expect(find.text('选文件'), findsOneWidget);
    expect(find.text('从手机相册选择'), findsOneWidget);
    expect(find.text('取消'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/attachment_picker_sheet_test.dart 2>&1 | tail -3`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 实现弹层 + PickedAttachment**

```dart
enum AttachmentPickSource { camera, file, gallery }

/// 已选附件：bytes 供上传，localPath 供本地缩略图预览。
class PickedAttachment {
  const PickedAttachment({required this.bytes, required this.filename, required this.mimeType, this.localPath, this.durationMs});

  final Uint8List bytes;
  final String filename;
  final String mimeType;
  final String? localPath;
  final int? durationMs;

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');
}

/// 弹出底部选择框（微信样式）。返回选中的附件；取消返回 null。
Future<List<PickedAttachment>?> showAttachmentPickerSheet(BuildContext context) async {
  final source = await showModalBottomSheet<AttachmentPickSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('拍摄'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.camera)),
          ListTile(leading: const Icon(Icons.folder_open), title: const Text('选文件'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.file)),
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('从手机相册选择'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.gallery)),
          const Divider(height: 1),
          ListTile(title: const Text('取消'), onTap: () => Navigator.pop(ctx)),
        ],
      ),
    ),
  );
  if (source == null || !context.mounted) return null;
  return _pickFromSource(source);
}

Future<List<PickedAttachment>?> _pickFromSource(AttachmentPickSource source) async {
  switch (source) {
    case AttachmentPickSource.camera:
      final x = await ImagePicker().pickImage(source: ImageSource.camera);
      if (x == null) return null;
      return [await _fromXFile(x)];
    case AttachmentPickSource.gallery:
      final xs = await ImagePicker().pickMultiImage();
      if (xs.isEmpty) return null;
      return [for (final x in xs) await _fromXFile(x)];
    case AttachmentPickSource.file:
      final result = await FilePicker.platform.pickFiles(type: FileType.media, withData: true);
      final f = result?.files.singleOrNull;
      if (f == null || f.bytes == null) return null;
      return [PickedAttachment(bytes: f.bytes!, filename: f.name, mimeType: _mimeFromName(f.name), localPath: f.path)];
  }
}

Future<PickedAttachment> _fromXFile(XFile x) async {
  final bytes = await x.readAsBytes();
  return PickedAttachment(bytes: bytes, filename: x.name, mimeType: lookupMimeType(x.path) ?? 'application/octet-stream', localPath: x.path);
}

String _mimeFromName(String name) =>
    lookupMimeType(name) ?? 'application/octet-stream';
```

（`lookupMimeType` 来自 `package:mime/mime.dart`——如未随依赖引入则 `flutter pub add mime`。）

- [ ] **Step 4: 跑测试确认通过 + 补齐 picker mock**

Run: `cd apps/mobile && flutter test test/features/moment/attachment_picker_sheet_test.dart 2>&1 | tail -1`
Expected: 弹层渲染测试通过（pick 分支不在 widget 测试中触发）

- [ ] **Step 5: Commit**

```bash
git add lib/features/moment/widgets/attachment_picker_sheet.dart lib/features/moment/moment_models.dart test/features/moment/attachment_picker_sheet_test.dart
git commit -m "feat(mobile): attachment picker bottom sheet with camera/file/gallery"
```

---

### Task 4: LocalAttachmentGrid 本地附件网格

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/local_attachment_grid.dart`
- Test: `apps/mobile/test/features/moment/local_attachment_grid_test.dart`

**Interfaces:**
- Consumes: `PickedAttachment`（Task 3）
- Produces:
  - `class LocalAttachmentGrid extends StatelessWidget { const LocalAttachmentGrid({required this.attachments, required this.onRemove, required this.onAdd}); }`
  - 3 列网格：图片 `Image.file`、视频灰底 ▶+时长、音频图标+文件名；瓦片右上角 ✕（`onRemove(index)`）；末尾「+」瓦片（`onAdd()`）

- [ ] **Step 1: 写失败测试**

`test/features/moment/local_attachment_grid_test.dart`：

```dart
PickedAttachment img(int i) => PickedAttachment(
      bytes: Uint8List.fromList([1, 2, 3]), filename: 'p$i.jpg',
      mimeType: 'image/jpeg', localPath: '/tmp/p$i.jpg');

void main() {
  testWidgets('渲染附件瓦片：图片/视频/音频区分 + 「+」瓦片', (tester) async {
    final list = [
      img(0),
      const PickedAttachment(bytes: Uint8List.fromList([1]), filename: 'v.mp4', mimeType: 'video/mp4', durationMs: 150000),
      const PickedAttachment(bytes: Uint8List.fromList([1]), filename: 'a.mp3', mimeType: 'audio/mpeg'),
    ];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LocalAttachmentGrid(attachments: list, onRemove: (_) {}, onAdd: () {}))));
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
    expect(find.text('a.mp3'), findsOneWidget);
    expect(find.byIcon(Icons.audio_file), findsOneWidget);
  });

  testWidgets('点 ✕ 触发 onRemove 且携带正确 index；点「+」触发 onAdd', (tester) async {
    final removed = <int>[];
    var added = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LocalAttachmentGrid(
      attachments: [img(0), img(1)],
      onRemove: removed.add, onAdd: () => added++,
    ))));
    await tester.tap(find.byIcon(Icons.close).first);
    expect(removed, [0]);
    await tester.tap(find.byIcon(Icons.add));
    expect(added, 1);
  });
}
```

（注意：`Image.file` 在 widget 测试中读取本地路径会失败——`localPath` 指向不存在的文件。**测试用 `mocktail_image_network` 不适用 `Image.file`**；处理：`LocalAttachmentGrid` 的图片瓦片用 `Image.file(File(path), errorBuilder: 灰底图标)`，测试断言灰底图标存在即可；或测试中把图片瓦片断言改为「存在 Icon/容器」。实现时保证测试不依赖真实文件读取。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/local_attachment_grid_test.dart 2>&1 | tail -3`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 实现**

```dart
class LocalAttachmentGrid extends StatelessWidget {
  const LocalAttachmentGrid({super.key, required this.attachments, required this.onRemove, required this.onAdd});

  final List<PickedAttachment> attachments;
  final ValueChanged<int> onRemove;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, mainAxisSpacing: 4, crossAxisSpacing: 4),
      itemCount: attachments.length + 1,
      itemBuilder: (context, index) {
        if (index == attachments.length) return _AddTile(onTap: onAdd);
        return _LocalTile(attachment: attachments[index], onRemove: () => onRemove(index));
      },
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(Icons.add, color: scheme.onSurfaceVariant),
      ),
    );
  }
}

class _LocalTile extends StatelessWidget {
  const _LocalTile({required this.attachment, required this.onRemove});
  final PickedAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final a = attachment;
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: a.isImage
              ? (a.localPath != null
                  ? Image.file(File(a.localPath!), fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => ColoredBox(
                        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                        child: Icon(Icons.image, color: scheme.onSurfaceVariant)))
                  : ColoredBox(color: scheme.surfaceContainerHighest.withValues(alpha: 0.6)))
              : a.isVideo
                  ? ColoredBox(
                      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                      child: Stack(alignment: Alignment.center, children: [
                        Icon(Icons.play_circle_outline, size: 32, color: scheme.onSurfaceVariant),
                        if (a.durationMs != null)
                          Positioned(right: 4, bottom: 4, child: Text(
                            formatDurationMs(a.durationMs),
                            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant))),
                      ]))
                  : ColoredBox(
                      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(Icons.audio_file, size: 28, color: scheme.onSurfaceVariant),
                          const SizedBox(height: 4),
                          Text(a.filename, maxLines: 2, overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                        ]),
                      )),
        ),
        Positioned(
          top: 2, right: 2,
          child: InkWell(
            onTap: onRemove,
            child: Container(
              decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
              padding: const EdgeInsets.all(2),
              child: const Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}
```

（`formatDurationMs` 从 `widgets/attachment_grid.dart` import。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter test test/features/moment/local_attachment_grid_test.dart 2>&1 | tail -1`
Expected: `All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add lib/features/moment/widgets/local_attachment_grid.dart test/features/moment/local_attachment_grid_test.dart
git commit -m "feat(mobile): local attachment grid with remove and add tiles"
```

---

### Task 5: 发布页改造 — 附件 + 发表编排

**Files:**
- Modify: `apps/mobile/lib/features/moment/moment_create_page.dart`
- Modify: `apps/mobile/lib/features/moment/moment_providers.dart`（pickedAttachmentsProvider 落地）
- Test: `apps/mobile/test/features/moment/moment_create_page_test.dart`（新）

**Interfaces:**
- Consumes: `showAttachmentPickerSheet` + `PickedAttachment`（Task 3）、`LocalAttachmentGrid`（Task 4）、`createWithMedia`（Task 2）
- Produces: 改造后的 `MomentCreatePage`：附件网格（继续添加/删除）+ 正文 + 发表编排

- [ ] **Step 1: 写失败测试**

`test/features/moment/moment_create_page_test.dart`：

```dart
void main() {
  Future<void> pumpCreate(WidgetTester tester, {List<PickedAttachment>? initial}) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentListProvider.overrideWith((ref) async => []),
        if (initial != null)
          pickedAttachmentsProvider.overrideWith(() => PickedAttachments(initial: initial)),
      ],
      child: const MaterialApp(home: MomentCreatePage()),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('空文字发表被拦截', (tester) async {
    await pumpCreate(tester);
    await tester.tap(find.text('发表'));
    await tester.pump();
    expect(find.text('内容不能为空'), findsOneWidget);
  });

  testWidgets('有附件时显示本地网格', (tester) async {
    await pumpCreate(tester, initial: [
      PickedAttachment(bytes: Uint8List.fromList([1]), filename: 'a.jpg', mimeType: 'image/jpeg', localPath: '/tmp/a.jpg'),
    ]);
    expect(find.byType(LocalAttachmentGrid), findsOneWidget);
    expect(find.text('a.jpg'), findsNothing); // 图片瓦片不显示文件名
  });
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/moment_create_page_test.dart 2>&1 | tail -3`
Expected: FAIL（编译失败：pickedAttachmentsProvider/LocalAttachmentGrid 未接线）

- [ ] **Step 3: 实现**

`moment_providers.dart`（Task 2 占位落地）：

```dart
class PickedAttachments extends Notifier<List<PickedAttachment>> {
  PickedAttachments({List<PickedAttachment>? initial}) : _initial = initial;
  final List<PickedAttachment>? _initial;

  @override
  List<PickedAttachment> build() => _initial ?? const [];

  void set(List<PickedAttachment> value) => state = value;
  void addAll(List<PickedAttachment> value) => state = [...state, ...value];
  void removeAt(int index) => state = [...state]..removeAt(index);
  void clear() => state = const [];
}
```

（`Notifier` 带构造参数在 Riverpod 3 中通过 `NotifierProvider<PickedAttachments, List<PickedAttachment>>(PickedAttachments.new)` 使用；测试 override 用 `overrideWith(() => PickedAttachments(initial: ...))`。若 `PickedAttachments` 带可选参数构造在 build 中不可用，改为纯 `Notifier` + 测试直接 `ref.read(...notifier).addAll(...)` 或 override `pickedAttachmentsProvider` 的 `build`。**以实际可编译通过为准**。）

`moment_create_page.dart`：

```dart
class _MomentCreatePageState extends ConsumerState<MomentCreatePage> {
  final _controller = TextEditingController();
  bool _submitting = false;
  List<PickedAttachment> get _picked => ref.read(pickedAttachmentsProvider);

  @override
  void dispose() { _controller.dispose(); super.dispose(); }

  Future<void> _addMore() async {
    final picked = await showAttachmentPickerSheet(context);
    if (picked == null || !mounted) return;
    ref.read(pickedAttachmentsProvider.notifier).addAll(picked);
    setState(() {});
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final files = _picked
          .map((a) => (bytes: a.bytes, filename: a.filename, mimeType: a.mimeType))
          .toList();
      if (files.isEmpty) {
        await ref.read(momentActionsProvider).create(text);
      } else {
        await ref.read(momentActionsProvider).createWithMedia(text, files);
      }
      ref.read(pickedAttachmentsProvider.notifier).clear();
      if (mounted) context.pop();
    } on Exception catch (e) {
      // 失败保留已选附件与正文，可重试。
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final picked = ref.watch(pickedAttachmentsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('新建闪记'),
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('发表'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _controller,
            maxLength: 10000,
            minLines: 3,
            maxLines: null,
            textAlignVertical: TextAlignVertical.top,
            autofocus: true,
            decoration: const InputDecoration(hintText: '记录此刻的想法…', border: InputBorder.none, counterText: ''),
          ),
          if (picked.isNotEmpty) ...[
            const SizedBox(height: 12),
            LocalAttachmentGrid(
              attachments: picked,
              onRemove: (i) {
                ref.read(pickedAttachmentsProvider.notifier).removeAt(i);
              },
              onAdd: _addMore,
            ),
          ],
          if (picked.isEmpty) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _addMore,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('添加图片 / 视频 / 音频'),
            ),
          ],
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter test test/features/moment/moment_create_page_test.dart 2>&1 | tail -1`
Expected: `All tests passed!`

- [ ] **Step 5: 全量验证 + Commit**

```bash
cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test 2>&1 | tail -1
git add lib/features/moment/moment_providers.dart lib/features/moment/moment_create_page.dart test/features/moment/moment_create_page_test.dart
git commit -m "feat(mobile): create page with attachment upload orchestration"
```

---

### Task 6: app_shell 右上角 — 短按弹层 / 长按直进

**Files:**
- Modify: `apps/mobile/lib/app_shell.dart`
- Test: `apps/mobile/test/app_shell_test.dart`（改）

**Interfaces:**
- Consumes: `showAttachmentPickerSheet`（Task 3）、`pickedAttachmentsProvider`（Task 2/5）、`/moments/create` 路由
- Produces: 右上角 + 按钮：短按 → 弹层选完 → 进发布页；长按 → 直进发布页

- [ ] **Step 1: 写失败测试**

追加到 `test/app_shell_test.dart`（参考现有测试如何 pump AppShell）：

```dart
  testWidgets('短按 + 弹出附件选择弹层', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [/* 现有 router/counts override 同文件模式 */],
      child: const AppShell(child: SizedBox.shrink()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('新建闪记'));
    await tester.pumpAndSettle();
    expect(find.text('拍摄'), findsOneWidget);
    expect(find.text('选文件'), findsOneWidget);
    expect(find.text('从手机相册选择'), findsOneWidget);
  });

  testWidgets('长按 + 直接进入发布页', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [/* 同文件模式 */],
      child: const AppShell(child: SizedBox.shrink()),
    ));
    await tester.pumpAndSettle();
    await tester.longPress(find.byTooltip('新建闪记'));
    await tester.pumpAndSettle();
    expect(find.text('新建闪记'), findsWidgets); // 发布页 AppBar 标题
  });
```

（若 AppShell 测试需完整 router/GoRouter 才能 push，参考现有 app_shell_test.dart 的构造方式；如不可行则改为验证 `_onAddPressed` 行为回调。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/app_shell_test.dart 2>&1 | tail -3`
Expected: FAIL（当前按钮直接 push，无弹层）

- [ ] **Step 3: 实现**

`app_shell.dart` 中 `/moments` 分支按钮改为：

```dart
          if (location == '/moments')
            GestureDetector(
              // 短按弹选择框；长按直进发布页（微信同款：长按 = 纯文字）。
              onTap: () => _addMomentWithAttachment(context),
              onLongPress: () => context.push('/moments/create'),
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Icon(Icons.add),
              ),
            ),
```

新增方法：

```dart
  /// 短按 +：弹附件选择框 → 选完带附件进入发布页。
  Future<void> _addMomentWithAttachment(BuildContext context) async {
    final picked = await showAttachmentPickerSheet(context);
    if (picked == null || !context.mounted) return;
    ref.read(pickedAttachmentsProvider.notifier).set(picked);
    context.push('/moments/create');
  }
```

（`AppShell` 是 `ConsumerWidget`，`ref` 在 build 内可用；方法里通过 `context.read`/`ref` 传递——实现时保持 Riverpod 3 语法一致。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter test test/app_shell_test.dart 2>&1 | tail -1`
Expected: `All tests passed!`

- [ ] **Step 5: 全量验证 + Commit**

```bash
cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test 2>&1 | tail -1
git add lib/app_shell.dart test/app_shell_test.dart
git commit -m "feat(mobile): long-press for plain text moment, tap for attachment picker"
```

---

## 完成定义（Definition of Done）

- `flutter analyze` 无告警；`flutter test` 全绿（基线 125 + 新增）。
- 右上角 +：短按弹四选项（拍摄/选文件/从手机相册选择/取消）；长按直进发布页。
- 拍摄（拍照/录像）、相册多选、选文件（图/视频/音频）均能进入发布页并显示本地缩略图。
- 发布页可继续添加（不限数量）、删除附件；正文必填（空正文拦截提示「内容不能为空」）。
- 发表：逐个上传 → 创建带附件 Moment；失败保留附件与正文可重试。
- 真机验证（用户在场）：各来源走通上传 → 列表出现带附件新闪记。
