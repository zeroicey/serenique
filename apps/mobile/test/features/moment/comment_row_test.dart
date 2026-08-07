import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/widgets/comment_row.dart';

void main() {
  const longContent = '这是一条用于验证评论换行排版的测试评论，文字比较长，第二行应该顶到最左边、用上头像下方的空白空间，而不是在头像右侧空一列。看看效果怎么样吧。';

  testWidgets('短评论：头像 + 文字一行内显示', (tester) async {
    const c = MomentComment(
        id: 'c1', momentId: 'm1', content: '短评论', createdAt: 't', updatedAt: 't');
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: Center(
                child: SizedBox(width: 320, child: CommentRow(comment: c))))));
    await tester.pumpAndSettle();
    // 评论文字嵌在 Text.rich（WidgetSpan 头像）里，toPlainText 开头含 U+FFFC。
    expect(find.textContaining('短评论', findRichText: true), findsOneWidget);
  });

  testWidgets('长评论：首行让开头像，换行后的行顶到最左边（不空一列）', (tester) async {
    const c = MomentComment(
        id: 'c1', momentId: 'm1', content: longContent, createdAt: 't', updatedAt: 't');
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: Center(
                child: SizedBox(width: 320, child: CommentRow(comment: c))))));
    await tester.pumpAndSettle();

    // 长评论应被切成「首行（头像右侧）」+「其余（顶格）」两段。
    final firstRich = find.byWidgetPredicate((w) =>
        w is RichText && w.text.toPlainText().contains('这是一条用于验证评论换行'));
    final restRich = find.byWidgetPredicate(
        (w) => w is RichText && w.text.toPlainText().contains('头像右侧空一列'));
    expect(firstRich, findsOneWidget, reason: '应存在首行文字');
    expect(restRich, findsOneWidget, reason: '长评论应被切成「首行 + 其余」两段');

    // 其余文字：多行，且段落内每一行都顶格（局部 left≈0，无缩进）。
    final restParagraph = tester.renderObject<RenderParagraph>(restRich.first);
    final restPlain = restParagraph.text.toPlainText();
    final restBoxes = restParagraph.getBoxesForSelection(
        TextSelection(baseOffset: 0, extentOffset: restPlain.length));
    expect(restBoxes.length, greaterThan(1), reason: '其余文字应换行成多行');
    expect(restBoxes.every((b) => b.left < 1.0), isTrue,
        reason: '换行后的每一行都应顶到最左边，而非在头像右侧留空列');

    // 首行文字整体比其余文字靠右约一个头像宽度（让开头像）。
    final restGlobalDx = tester.getTopLeft(restRich.first).dx;
    final firstGlobalDx = tester.getTopLeft(firstRich.first).dx;
    expect(firstGlobalDx - restGlobalDx, greaterThan(20),
        reason: '首行应让出约一个头像的宽度（文字在头像右侧）');
  });
}
