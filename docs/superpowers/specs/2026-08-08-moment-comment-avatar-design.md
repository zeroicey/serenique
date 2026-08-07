# 2026-08-08 — Moment 评论头像 + 文字环绕排版（设计）

## 目标

给 Moment 评论前面加一个头像（复用 Web 端已有的 DiceBear 方案，seed=评论id，每条评论头像不同、更生动），并调整长评论换行：**文字环绕头像**，换行后的行顶到最左边、利用头像下方的空间，避免头像固定一列导致的空白。

范围：`apps/mobile`（本次）。Web 端（serenique-test `MomentCommentList.tsx`）已有头像，后续按同样思路改换行布局，保持两端一致。

## 设计决策（用户已确认）

| 决策 | 选择 |
|------|------|
| 头像来源 | 复用 DiceBear：`https://api.dicebear.com/7.x/pixel-art/svg?seed=<comment.id>`（与 Web 完全一致 → 两端头像相同） |
| 头像尺寸 | ~24px，圆形（ClipOval）；Web 是 32px，移动端评论内联头像取小号 |
| 头像失败兜底 | 按 comment.id 哈希出底色 + 人形图标的圆形占位 |
| 换行排版 | `Stack` + 文字 `TextStyle(textIndent: TextIndent(firstLine: <头像宽+间距>))`：首行缩进让出头像，换行后的行从最左开始（环绕头像） |
| 新依赖 | `flutter_svg`（渲染 DiceBear SVG） |
| 复用 | 抽共享组件 `CommentRow`，替换两处重复的评论块代码 |

## 组件设计

新增 `lib/features/moment/widgets/comment_row.dart`：

- `CommentRow`：单条评论 = `Row[ Expanded(Stack[Text(content, textIndent), Positioned(avatar)]), 可选删除按钮 ]`
  - `showDelete`/`onDelete` 可选：详情页显示删除 X，信息流不显示
- `CommentAvatar`：DiceBear SVG 网络图（`SvgPicture.network`），加载失败/为空时展示哈希底色圆形占位
- 换行环绕：`TextIndent(firstLine: 32)`（头像 24 + 间距 8）；调头像/行高对齐避免第二行与头像底部重叠

落点（替换两处评论块）：
- `lib/features/moment/widgets/comment_section.dart`（详情页）：内联评论列表改用 `CommentRow`，保留删除按钮
- `lib/features/moment/widgets/moment_card.dart` 的 `_CommentBlock`（信息流）：改用 `CommentRow`，无删除按钮

## 验证

- `flutter analyze` → No issues
- `flutter test` → 全过（含既有 62 例）
- 模拟器实测：详情页 + 信息流评论都显示每评论不同的像素头像；长评论换行后顶格；头像加载失败有兜底；删除按钮行为不变

## 后续（本次不做，用户看过 Flutter 后再改）

- serenique-test `MomentCommentList.tsx`：布局从「flex 头像列 + flex-1 文字列」改为「首行缩进、换行顶格」（CSS：avatar absolute + 段落 text-indent），保持与 Flutter 一致
