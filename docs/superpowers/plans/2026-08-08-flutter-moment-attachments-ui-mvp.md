# Flutter 移动端 — Moment 附件缩略图 + 全屏预览（UI MVP）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/mobile` 的 Moment 支持附件**缩略图网格显示**（列表页 + 详情页）与**全屏预览**（当前页面之上盖黑底遮罩淡入，PageView 左右滑动，底部 `1/N` 计数，点图片关闭）。视频/音频只做占位。

**Architecture:** 预览不 push 新页面——用 `showGeneralDialog` + 全屏黑底 `barrierColor` + `FadeTransition` 淡入，视觉上就是「在当前页面上面盖一层遮罩」（对齐用户明确要求：不要向左滑动的新页面过渡）。图片加载走已完成的 `blobAccessUrlProvider`（签名链接内存缓存 + 过期刷新 + 失败回退直链）。网格算法对齐 Web `moment-attachment-grid.tsx`（>9 张折叠前 8 + 「+N 更多」瓦片，就地展开）。

**Tech Stack:** Flutter / Dart；新增 dev 依赖 `mocktail_image_network ^1.3.0`（widget 测试拦截网络图片，API 是 `mockNetworkImages`，**不是** `mockNetworkImagesFor`）。不加任何媒体播放库。

## Global Constraints

（来自 spec：`.ai/architecture/2026-08-08-flutter-moment-attachments-design.md`，违反即失败）

- 预览载体必须是**遮罩**：`showGeneralDialog` + 黑底 + 淡入（150ms），**绝不 push 带滑动过渡的新页面**。
- 预览关闭 = 点图片（`GestureDetector.onTap` → pop），**无关闭按钮**。
- 底部居中显示 `1 / N` 计数（半透明白字，`SafeArea` 内）。
- 图片页：`InteractiveViewer(minScale: 1, maxScale: 4)` + child `SizedBox.expand(Image.network(fit: BoxFit.contain))` —— 初始整图在屏内，捏合放大；**不要**用 `Center(InteractiveViewer(...))` 收缩包裹（黑边坑）。
- 网格 3 列正方形瓦片（aspect 1:1），`>9` 折叠显示前 8 + 「+N 更多」，点更多**就地展开**（`setState`，不进预览）。
- 视频瓦片：灰底 + ▶ 图标 + 时长（`mm:ss`）；音频瓦片：图标 + 文件名；均不可点击预览内容（仍可点开预览页的占位页）。
- 模型字段与 `services/api` 源码一致（`attachments[].blob.fileUrl` 等）；`isImage/isVideo/isAudio` 按 mimeType 前缀判断。
- 用户可见文案中文。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿（当前基线 100/100）。
- Commit message 英文（conventional style）。

---

## 文件结构

```
apps/mobile/
├── pubspec.yaml                                     # 改：dev + mocktail_image_network
├── lib/features/moment/
│   ├── widgets/attachment_grid.dart                 # 新：3 列缩略图网格（折叠/展开/瓦片类型）
│   ├── media_preview.dart                           # 新：showMediaPreview 遮罩 + PageView + 计数
│   ├── widgets/moment_card.dart                     # 改：正文下方插网格
│   └── moment_detail_page.dart                      # 改：正文下方插网格
└── test/features/moment/
    ├── attachment_grid_test.dart                    # 新
    ├── media_preview_test.dart                      # 新
    ├── moment_card_test.dart                        # 新（附件网格接线）
    └── moment_detail_page_test.dart                 # 改：附件网格用例
```

依赖关系：Task 2/3 的组件都消费 `blobAccessUrlProvider`（已在 `moment_providers.dart`，`FutureProvider.autoDispose.family<String, String>`，无需改动）。Task 4 接线消费 Task 2/3 的 `AttachmentGrid` 与 `showMediaPreview`。

---

### Task 1: 加 dev 依赖 mocktail_image_network

**Files:**
- Modify: `apps/mobile/pubspec.yaml`

**Interfaces:**
- Produces: 测试可用的 `mockNetworkImages`（拦截 widget 测试中的 `Image.network`）

- [ ] **Step 1: 添加依赖并验证**

```bash
cd apps/mobile && flutter pub add --dev mocktail_image_network:^1.3.0
```

- [ ] **Step 2: 确认版本与锁定**

Run: `grep -A2 mocktail pubspec.yaml`
Expected: `mocktail_image_network: ^1.3.0` 出现在 dev_dependencies。

- [ ] **Step 3: 跑基线测试确认无破坏**

Run: `cd apps/mobile && flutter test 2>&1 | tail -1`
Expected: `All tests passed!`（100/100）

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/pubspec.yaml apps/mobile/pubspec.lock
git commit -m "chore(mobile): add mocktail_image_network dev dependency"
```

---

### Task 2: AttachmentGrid 缩略图网格组件

**Files:**
- Create: `apps/mobile/lib/features/moment/widgets/attachment_grid.dart`
- Test: `apps/mobile/test/features/moment/attachment_grid_test.dart`

**Interfaces:**
- Consumes: `MomentAttachment`（`moment_models.dart`，已有 `isImage/isVideo/isAudio/blob.mimeType/blob.duration/sortOrder/displayLabel`）、`blobAccessUrlProvider(blobId)`（`moment_providers.dart`）
- Produces:
  - `class AttachmentGrid extends ConsumerStatefulWidget { const AttachmentGrid({required List<MomentAttachment> attachments, required void Function(int index) onTapTile}); }`
  - 点击第 `i` 个可见瓦片（含折叠态）→ `onTapTile(i)`；点「+N 更多」→ 就地展开

- [ ] **Step 1: 写失败测试**

```dart
// apps/mobile/test/features/moment/attachment_grid_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';

MomentAttachment att(int i, {String mime = 'image/jpeg'}) => MomentAttachment(
      id: 'a$i',
      blobId: 'b$i',
      role: 'attachment',
      sortOrder: i,
      blob: MomentBlob(
        id: 'b$i',
        originalName: 'p$i.jpg',
        mimeType: mime,
        size: 1,
        fileUrl: '/api/blobs/b$i/file',
        createdAt: 't',
      ),
    );

Widget wrap(Widget child) => ProviderScope(
      overrides: [
        blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
    );

void main() {
  testWidgets('1 张图渲染 1 个瓦片', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: [att(0)], onTapTile: (_) {})));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsOneWidget);
    });
  });

  testWidgets('>9 张折叠：前 8 张 + 「+6 更多」瓦片', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(14, att), onTapTile: (_) {})));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNWidgets(8));
      expect(find.text('+6 更多'), findsOneWidget);
    });
  });

  testWidgets('点「更多」就地展开显示全部', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(10, att), onTapTile: (_) {})));
      await tester.pumpAndSettle();
      await tester.tap(find.text('+2 更多'));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNWidgets(10));
      expect(find.text('+2 更多'), findsNothing);
    });
  });

  testWidgets('≤9 张不折叠', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(9, att), onTapTile: (_) {})));
      await tester.pumpAndSettle();
      expect(find.byType(Image), findsNWidgets(9));
      expect(find.textContaining('更多'), findsNothing);
    });
  });

  testWidgets('点击瓦片回调携带正确 index', (tester) async {
    await mockNetworkImages(() async {
      final tapped = <int>[];
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(4, att), onTapTile: tapped.add)));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Image).at(2));
      expect(tapped, [2]);
    });
  });

  testWidgets('视频瓦片：▶ + 时长 mm:ss；音频瓦片：图标 + 文件名', (tester) async {
    await mockNetworkImages(() async {
      final video = att(0, mime: 'video/mp4');
      final audio = att(1, mime: 'audio/mpeg');
      await tester.pumpWidget(wrap(AttachmentGrid(
        attachments: [video, audio],
        onTapTile: (_) {},
      )));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
      expect(find.text('00:00'), findsOneWidget); // duration 为空显示 00:00
      expect(find.byIcon(Icons.audio_file), findsOneWidget);
      expect(find.text('p1.jpg'), findsOneWidget); // audio 瓦片显示文件名
    });
  });
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/attachment_grid_test.dart 2>&1 | tail -5`
Expected: 编译失败（找不到 `attachment_grid.dart`）。

- [ ] **Step 3: 实现 AttachmentGrid**

```dart
// apps/mobile/lib/features/moment/widgets/attachment_grid.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 朋友圈 3 列附件缩略图网格。>9 张折叠显示前 8 张 + 「+N 更多」瓦片，
/// 点「更多」就地展开全部。点击第 i 个瓦片回调 onTapTile(i)。
class AttachmentGrid extends ConsumerStatefulWidget {
  const AttachmentGrid({super.key, required this.attachments, required this.onTapTile});

  final List<MomentAttachment> attachments;
  final void Function(int index) onTapTile;

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
    final display =
        needsExpand && !_expanded ? sorted.sublist(0, _previewCount) : sorted;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
      ),
      itemCount: display.length + (needsExpand && !_expanded ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == display.length) {
          return _MoreTile(
            extra: sorted.length - _previewCount,
            onTap: () => setState(() => _expanded = true),
          );
        }
        final attachment = display[index];
        return _AttachmentTile(
          attachment: attachment,
          onTap: () => widget.onTapTile(index),
        );
      },
    );
  }
}

/// 第 9 格「+N 更多」瓦片。
class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.extra, required this.onTap});

  final int extra;
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.more_horiz, size: 28, color: scheme.onSurfaceVariant),
            Text('+$extra 更多',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _AttachmentTile extends ConsumerWidget {
  const _AttachmentTile({required this.attachment, required this.onTap});

  final MomentAttachment attachment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blob = attachment.blob;
    final url = ref.watch(blobAccessUrlProvider(blob.id));
    final scheme = Theme.of(context).colorScheme;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: double.infinity,
          height: double.infinity,
          child: url.when(
            loading: () => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: const Center(
                  child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: Icon(Icons.broken_image, color: scheme.onSurfaceVariant),
            ),
            data: (u) => switch (blob) {
              _ when blob.isImage => Image.network(
                  u,
                  fit: BoxFit.cover,
                  loadingBuilder: (_, child, progress) =>
                      progress == null ? child : const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  errorBuilder: (_, _, _) => ColoredBox(
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                    child: Icon(Icons.broken_image, color: scheme.onSurfaceVariant),
                  ),
                ),
              _ when blob.isVideo => _VideoPlaceholder(durationMs: blob.duration),
              _ => _AudioPlaceholder(label: attachment.displayLabel),
            },
          ),
        ),
      ),
    );
  }
}

/// 视频瓦片占位：灰底 + ▶ + 时长。
class _VideoPlaceholder extends StatelessWidget {
  const _VideoPlaceholder({this.durationMs});

  final int? durationMs;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.play_circle_outline,
              size: 32, color: scheme.onSurfaceVariant),
          Positioned(
            right: 4,
            bottom: 4,
            child: Text(
              formatDurationMs(durationMs),
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// 音频/其他瓦片占位：灰底 + 图标 + 文件名。
class _AudioPlaceholder extends StatelessWidget {
  const _AudioPlaceholder({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.audio_file, size: 28, color: scheme.onSurfaceVariant),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// 毫秒 → mm:ss（不足 1 分钟补零；≥1 小时 h:mm:ss）。
String formatDurationMs(int? ms) {
  if (ms == null || ms <= 0) return '00:00';
  final totalSeconds = ms ~/ 1000;
  final h = totalSeconds ~/ 3600;
  final m = (totalSeconds % 3600) ~/ 60;
  final s = totalSeconds % 60;
  String two(int v) => v.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test test/features/moment/attachment_grid_test.dart 2>&1 | tail -1`
Expected: `No issues found` + `All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/features/moment/widgets/attachment_grid.dart apps/mobile/test/features/moment/attachment_grid_test.dart
git commit -m "feat(mobile): add moment attachment thumbnail grid with expand"
```

---

### Task 3: MediaPreview 全屏预览遮罩

**Files:**
- Create: `apps/mobile/lib/features/moment/media_preview.dart`
- Test: `apps/mobile/test/features/moment/media_preview_test.dart`

**Interfaces:**
- Consumes: `MomentAttachment`、`blobAccessUrlProvider(blobId)`、`formatDurationMs`（Task 2）
- Produces:
  - `Future<void> showMediaPreview(BuildContext context, {required List<MomentAttachment> attachments, required int initialIndex})`
  - 遮罩内部 `MediaPreviewOverlay` 支持 `PageView` 滑动、底部 `1/N` 计数、点图片关闭（视频/音频占位页同样点按关闭）

- [ ] **Step 1: 写失败测试**

```dart
// apps/mobile/test/features/moment/media_preview_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/media_preview.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

MomentAttachment att(int i, {String mime = 'image/jpeg'}) => MomentAttachment(
      id: 'a$i',
      blobId: 'b$i',
      role: 'attachment',
      sortOrder: i,
      blob: MomentBlob(
        id: 'b$i',
        originalName: 'p$i.jpg',
        mimeType: mime,
        size: 1,
        fileUrl: '/api/blobs/b$i/file',
        createdAt: 't',
      ),
    );

void main() {
  Future<void> open(WidgetTester tester, List<MomentAttachment> list, {int index = 0}) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showMediaPreview(context,
                      attachments: list, initialIndex: index),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    });
  }

  testWidgets('打开后显示 1/N 计数与图片', (tester) async {
    await open(tester, [att(0), att(1), att(2)]);
    expect(find.text('1 / 3'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
  });

  testWidgets('从指定 index 打开，计数正确', (tester) async {
    await open(tester, [att(0), att(1), att(2)], index: 2);
    expect(find.text('3 / 3'), findsOneWidget);
  });

  testWidgets('左右滑动切换并更新计数', (tester) async {
    await open(tester, [att(0), att(1), att(2)]);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await tester.pumpAndSettle();
    expect(find.text('2 / 3'), findsOneWidget);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await tester.pumpAndSettle();
    expect(find.text('3 / 3'), findsOneWidget);
  });

  testWidgets('点图片关闭遮罩', (tester) async {
    await open(tester, [att(0)]);
    expect(find.text('1 / 1'), findsOneWidget);
    await tester.tap(find.byType(InteractiveViewer));
    await tester.pumpAndSettle();
    expect(find.text('1 / 1'), findsNothing);
  });

  testWidgets('视频/音频页显示占位（▶ + 时长 / 图标 + 文件名）', (tester) async {
    final video = MomentAttachment(
      id: 'v', blobId: 'bv', role: 'attachment', sortOrder: 0,
      blob: MomentBlob(id: 'bv', originalName: 'v.mp4', mimeType: 'video/mp4',
          size: 1, duration: 150000, fileUrl: '/f', createdAt: 't'),
    );
    final audio = MomentAttachment(
      id: 'au', blobId: 'ba', role: 'attachment', sortOrder: 1,
      blob: MomentBlob(id: 'ba', originalName: 'a.mp3', mimeType: 'audio/mpeg',
          size: 1, fileUrl: '/f', createdAt: 't'),
    );
    await open(tester, [video, audio]);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
    expect(find.text('02:30'), findsOneWidget);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.audio_file), findsOneWidget);
    expect(find.text('a.mp3'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/media_preview_test.dart 2>&1 | tail -5`
Expected: 编译失败（找不到 `media_preview.dart`）。

- [ ] **Step 3: 实现 MediaPreview**

```dart
// apps/mobile/lib/features/moment/media_preview.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/attachment_grid.dart' show formatDurationMs;

/// 全屏媒体预览遮罩：在当前页面之上盖黑底淡入（不 push 新页面）。
/// 左右滑动切换；底部居中 1/N 计数；点图片/占位页关闭（无关闭按钮）。
Future<void> showMediaPreview(
  BuildContext context, {
  required List<MomentAttachment> attachments,
  required int initialIndex,
}) {
  return showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black,
    barrierDismissible: false,
    transitionDuration: const Duration(milliseconds: 150),
    pageBuilder: (ctx, _, _) => MediaPreviewOverlay(
      attachments: attachments,
      initialIndex: initialIndex,
    ),
    transitionBuilder: (ctx, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}

class MediaPreviewOverlay extends ConsumerStatefulWidget {
  const MediaPreviewOverlay({
    super.key,
    required this.attachments,
    required this.initialIndex,
  });

  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  ConsumerState<MediaPreviewOverlay> createState() =>
      _MediaPreviewOverlayState();
}

class _MediaPreviewOverlayState extends ConsumerState<MediaPreviewOverlay> {
  late final PageController _controller =
      PageController(initialPage: widget.initialIndex);
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final attachments = widget.attachments;
    return Stack(
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: attachments.length,
          onPageChanged: (i) => setState(() => _current = i),
          itemBuilder: (ctx, i) =>
              _MediaPage(attachment: attachments[i]),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: MediaQuery.of(context).padding.bottom + 16,
          child: Center(
            child: Text(
              '${_current + 1} / ${attachments.length}',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MediaPage extends ConsumerWidget {
  const _MediaPage({required this.attachment});

  final MomentAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blob = attachment.blob;
    final url = ref.watch(blobAccessUrlProvider(blob.id));
    final scheme = Theme.of(context).colorScheme;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.of(context).pop(),
      child: url.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Icon(Icons.broken_image, size: 64, color: Colors.white54),
        ),
        data: (u) => blob.isImage
            ? InteractiveViewer(
                minScale: 1,
                maxScale: 4,
                child: SizedBox.expand(
                  child: Image.network(
                    u,
                    fit: BoxFit.contain,
                    loadingBuilder: (_, child, progress) =>
                        progress == null ? child : const Center(child: CircularProgressIndicator()),
                    errorBuilder: (_, _, _) => Center(
                      child: Icon(Icons.broken_image,
                          size: 64, color: Colors.white54),
                    ),
                  ),
                ),
              )
            : blob.isVideo
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.play_circle_outline,
                            size: 72, color: scheme.onSurfaceVariant),
                        const SizedBox(height: 8),
                        Text(
                          formatDurationMs(blob.duration),
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ],
                    ),
                  )
                : Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.audio_file,
                            size: 72, color: scheme.onSurfaceVariant),
                        const SizedBox(height: 8),
                        Text(
                          attachment.displayLabel,
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test test/features/moment/media_preview_test.dart 2>&1 | tail -1`
Expected: `No issues found` + `All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/features/moment/media_preview.dart apps/mobile/test/features/moment/media_preview_test.dart
git commit -m "feat(mobile): add fullscreen media preview overlay with paging and counter"
```

---

### Task 4: 接线 —— 列表卡片 + 详情页插入网格

**Files:**
- Modify: `apps/mobile/lib/features/moment/widgets/moment_card.dart`
- Modify: `apps/mobile/lib/features/moment/moment_detail_page.dart`
- Test: `apps/mobile/test/features/moment/moment_card_test.dart`（新）
- Test: `apps/mobile/test/features/moment/moment_detail_page_test.dart`（改）

**Interfaces:**
- Consumes: `AttachmentGrid`（Task 2）、`showMediaPreview`（Task 3）
- Produces: 有附件的 Moment 在列表卡片（正文下方、时间行上方）与详情页（正文下方）显示网格，点瓦片打开预览

- [ ] **Step 1: 写失败测试（卡片 + 详情页）**

```dart
// apps/mobile/test/features/moment/moment_card_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';
import 'package:serenique_mobile/features/moment/widgets/moment_card.dart';

MomentAttachment att(int i) => MomentAttachment(
      id: 'a$i',
      blobId: 'b$i',
      role: 'attachment',
      sortOrder: i,
      blob: MomentBlob(
        id: 'b$i', originalName: 'p$i.jpg', mimeType: 'image/jpeg',
        size: 1, fileUrl: '/api/blobs/b$i/file', createdAt: 't',
      ),
    );

void main() {
  Moment momentWithAttachments() => Moment(
        id: 'm1',
        text: '看照片',
        attachments: [att(0), att(1)],
        comments: const [],
        commentCount: 0,
        createdAt: 't',
        updatedAt: 't',
      );

  testWidgets('卡片正文下方显示附件网格', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: Scaffold(body: MomentCard(moment: momentWithAttachments()))),
      ));
      await tester.pumpAndSettle();
      expect(find.text('看照片'), findsOneWidget);
      expect(find.byType(AttachmentGrid), findsOneWidget);
      expect(find.byType(Image), findsNWidgets(2));
    });
  });

  testWidgets('点卡片瓦片打开全屏预览遮罩', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: Scaffold(body: MomentCard(moment: momentWithAttachments()))),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Image).first);
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget); // 预览遮罩出现
      expect(find.byType(InteractiveViewer), findsOneWidget);
    });
  });
}
```

详情页测试追加（修改 `moment_detail_page_test.dart`，在文件末尾 main 内新增）：

```dart
  // 附件网格：详情页正文下方显示并可打开预览
  testWidgets('详情页正文下方显示附件网格，点瓦片打开预览', (tester) async {
    await mockNetworkImages(() async {
      final withAtt = Moment(
        id: 'm1', text: '看图', attachments: [att(0), att(1)],
        comments: const [], commentCount: 0, createdAt: 't', updatedAt: 't',
      );
      await tester.pumpWidget(ProviderScope(
        overrides: [
          momentDetailProvider.overrideWith((ref, id) async => withAtt),
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: MomentDetailPage(id: 'm1')),
      ));
      await tester.pumpAndSettle();
      expect(find.byType(AttachmentGrid), findsOneWidget);
      expect(find.byType(Image), findsNWidgets(2));
      await tester.tap(find.byType(Image).first);
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget);
    });
  });
```

（`moment_detail_page_test.dart` 需追加 import：`mocktail_image_network`、`attachment_grid.dart`，并按现有文件风格放测试。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/mobile && flutter test test/features/moment/moment_card_test.dart 2>&1 | tail -5`
Expected: 编译失败或卡片上找不到 `AttachmentGrid`。

- [ ] **Step 3: 接线 moment_card.dart**

在 `moment_card.dart` 中，正文 `Text` 之后、「全文/收起」逻辑之后、时间行 `Row` 之前插入：

```dart
            // 附件网格：正文下方、时间行上方（朋友圈位置）。
            if (moment.attachments.isNotEmpty) ...[
              const SizedBox(height: 8),
              AttachmentGrid(
                attachments: moment.attachments,
                onTapTile: (index) => showMediaPreview(
                  context,
                  attachments: moment.attachments,
                  initialIndex: index,
                ),
              ),
            ],
```

import 增加：

```dart
import '../media_preview.dart';
import 'attachment_grid.dart';
```

- [ ] **Step 4: 接线 moment_detail_page.dart**

在 `moment_detail_page.dart` 的 `ListView` 中，`TextField`（正文）之后、时间 `Text` 之前插入：

```dart
              // 附件网格：正文下方。
              if (moment.attachments.isNotEmpty) ...[
                const SizedBox(height: 8),
                AttachmentGrid(
                  attachments: moment.attachments,
                  onTapTile: (index) => showMediaPreview(
                    context,
                    attachments: moment.attachments,
                    initialIndex: index,
                  ),
                ),
              ],
```

import 增加：

```dart
import 'media_preview.dart';
import 'widgets/attachment_grid.dart';
```

- [ ] **Step 5: 跑全量验证**

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -1 && flutter test 2>&1 | tail -1`
Expected: `No issues found` + `All tests passed!`（基线 100 + 新增）

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/features/moment/widgets/moment_card.dart apps/mobile/lib/features/moment/moment_detail_page.dart apps/mobile/test/features/moment/moment_card_test.dart apps/mobile/test/features/moment/moment_detail_page_test.dart
git commit -m "feat(mobile): wire attachment grid into moment card and detail page"
```

---

## 完成定义（Definition of Done）

- `flutter analyze` 无告警；`flutter test` 全绿（基线 100 + 新增用例）。
- 列表页与详情页：有附件的 Moment 显示 3 列缩略图网格；>9 折叠 + 「更多」就地展开。
- 点瓦片：全屏黑底**淡入遮罩**（无新页面滑动感），左右滑动切换，底部 `1/N` 计数，点图片关闭。
- 视频/音频：网格与预览均为占位（▶ + 时长 / 图标 + 文件名）。
- 真机验证（用户在场）：release 构建装 iPhone → 生产 API → 列表/详情网格显示 → 预览滑动/缩放/关闭。
