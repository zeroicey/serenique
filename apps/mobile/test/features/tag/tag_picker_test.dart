import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/tag/tag_api.dart';
import 'package:serenique_mobile/features/tag/tag_providers.dart';
import 'package:serenique_mobile/features/tag/widgets/tag_picker.dart';

class _FakeTagApi extends TagApi {
  _FakeTagApi(this.items)
    : super(ApiClient(baseUrl: 'http://localhost', tokenReader: () => null));

  final List<MomentTag> items;

  @override
  Future<List<MomentTag>> list() async => List.of(items);
}

void main() {
  testWidgets('选择器多选返回选中标签', (tester) async {
    final fake = _FakeTagApi(const [
      MomentTag(id: 't1', name: '工作', momentCount: 3),
      MomentTag(id: 't2', name: '生活', momentCount: 1),
      MomentTag(id: 't3', name: '读书', momentCount: 0),
    ]);
    List<MomentTag>? picked;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (ctx) => ElevatedButton(
                onPressed: () async {
                  picked = await showTagPicker(ctx);
                },
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    // 全部标签展示
    expect(find.text('工作'), findsOneWidget);
    expect(find.text('3 条闪记'), findsOneWidget);

    // 勾选两个，确定后返回
    await tester.tap(find.text('工作'));
    await tester.tap(find.text('读书'));
    await tester.pump();
    expect(find.textContaining('确定（2）'), findsOneWidget);
    await tester.tap(find.text('确定（2）'));
    await tester.pumpAndSettle();

    expect(picked, isNotNull);
    expect(picked!.map((t) => t.id).toSet(), {'t1', 't3'});
  });

  testWidgets('搜索过滤：只显示匹配标签（只选已有）', (tester) async {
    final fake = _FakeTagApi(const [
      MomentTag(id: 't1', name: '工作', momentCount: 3),
      MomentTag(id: 't2', name: '生活', momentCount: 1),
    ]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: const MaterialApp(home: Scaffold(body: TagPickerSheet())),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '生活');
    await tester.pumpAndSettle();
    expect(find.text('工作'), findsNothing);
    expect(find.widgetWithText(CheckboxListTile, '生活'), findsOneWidget);
  });
}
