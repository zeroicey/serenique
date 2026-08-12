# 2026-08-13 — Moment 全局搜索 Flutter 端（搜索栏 + 服务端过滤 + 分页）

实现需求文档 `.ai/requirements/2026-08-13-moment-global-search.md` 第 5.2 节 + 决策 ⑬：moment 列表页 AppBar 下方新增搜索栏，300ms 防抖后经 `GET /api/moments?q=` 服务端过滤。本次只做 apps/mobile，不动后端契约（后端 `q` 参数由 api-agent 同批实施）。

## 改动（apps/mobile）

- **`lib/features/moment/moment_models.dart`**：新增 `MomentPage { items, total }`（对齐后端 `{items,total}` 分页响应，load-more 判据）。
- **`lib/features/moment/moment_api.dart`**：
  - `list()` 增加 `query` 参数（透传给 `listPage`）。
  - 新增 `listPage({page, pageSize, query})` 返回 `MomentPage`；`query` trim 后非空才拼 `q`（空白关键词 = 全量列表，对齐 Web）。
- **`lib/features/moment/moment_providers.dart`**：
  - 新增 `momentSearchKeywordProvider`（`NotifierProvider<MomentSearchKeywordNotifier, String>`）。
  - `momentListProvider` 从 `FutureProvider<List<Moment>>` 升级为 `AsyncNotifierProvider<MomentListNotifier, MomentPage>`：
    - `build()` watch 搜索词 → 搜索词变化 → notifier 重建 → **自动重置回第 1 页**（分页状态天然重置）。
    - `loadMore()` 追加下一页；请求期间捕获关键词，若用户改了搜索词则丢弃过期结果（防污染新搜索词的列表）；`_fetching` 防重复触发；失败保留已加载数据并抛错给页面提示。
    - `MomentActions` 的 `invalidate(momentListProvider)` 无需改动（AsyncNotifier 同样支持）。
- **`lib/features/moment/moment_list_page.dart`**：
  - `ConsumerWidget` → `ConsumerStatefulWidget`：持有 `TextEditingController` + `ScrollController` + `Timer`。
  - AppBar 下方搜索栏（Material 3 `SearchBar`）：前缀 `Search` 图标 + 内容非空时显示清除按钮（X）。
  - 防抖：`Timer(300ms)`，输入停止 300ms 后才写入搜索词；**清空立即生效**（恢复全量列表，不等防抖）；`dispose` 里 `_debounce?.cancel()`。
  - 无限滚动：scroll 接近底部（`maxScrollExtent - 300`）触发 `loadMore`，底部预留 spinner 占位。
  - 空态：搜索词非空 && 结果空 → 「未找到匹配的闪记」；否则保留「还没有闪记，点右下角新建」。
  - 搜索栏在所有分支（loading/error/空态）常驻渲染，保证无结果时也能清除关键词（对齐 Web 坑 3）。
  - 复用现有 `MomentCard`。

## 验证

- `flutter analyze` → **No issues found**
- `flutter test` → **273/273 PASS**（含新增：API `listPage` q 拼参 2 例、搜索防抖/空态/清除 2 个 widget 测试）

## 坑 / 对下一次会话的提示

1. **Riverpod 3.4.2 没有公开导出的 `StateProvider`**：`flutter_riverpod` 3.x 主库只导出 `Notifier`/`NotifierProvider` 等；`StateProvider` 藏在 `package:riverpod/legacy.dart` 的 `show` 列表里（源码 `src/providers/legacy/state_provider.dart` 有定义但主入口不导出）。需求文档说的「StateProvider」在 Flutter 端用**`NotifierProvider` + `Notifier<String>`** 等价实现（与 audit 的 `AuditFilterNotifier` 同款模式）。同理 **`AsyncValue.valueOrNull` 不存在**——Riverpod 3 的 `value` 本身就是 `ValueT?`（可空），直接判空即可。
2. **`SearchBar` 内部就是 `TextField`**：给 moment 列表加 `SearchBar` 后，原测试里 `find.byType(TextField)` 会命中搜索栏的 TextField（评论输入框隐藏断言全挂）。评论输入框必须用 hint 区分：`find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == '写评论…')`。
3. **`AsyncNotifierProvider` 测试 override 形态变了**：不再是 `overrideWith((ref) async => [items])`，而是 `overrideWith(() => FakeNotifier(...))`，fake 必须 `extends` 真实 notifier 类。统一放进 `test/helpers.dart`（`FakeMomentListNotifier`），7 处 router_test + create_page_test + list_page_test 全量替换。
4. **load-more 与搜索的竞态**：滚动触发的 `loadMore` 在请求期间若用户改了搜索词，notifier 已重建（build 重置回第 1 页），旧响应回来若直接 append 会污染新结果。解法：请求前 `ref.read` 捕获关键词，响应后比对 `ref.read` 现值，不一致直接丢弃。
5. **并行 agent 未提交改动**：工作区有 services/api（拼音列 + q）、apps/web、apps/cli 的同批未提交改动，提交时只 stage apps/mobile 的文件。
