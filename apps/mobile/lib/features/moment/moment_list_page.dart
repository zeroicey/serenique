import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import '../tag/tag_providers.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/moment_card.dart';

/// 闪记列表 —— 朋友圈风格的信息流。
/// AppBar 下方搜索栏（300ms 防抖，服务端过滤）+ 无限滚动分页；
/// 每条闪记显示纯文本（长文可展开）+ 时间 + 内嵌评论；点卡片进详情（评论/删除）。
class MomentListPage extends ConsumerStatefulWidget {
  const MomentListPage({super.key});

  @override
  ConsumerState<MomentListPage> createState() => _MomentListPageState();
}

class _MomentListPageState extends ConsumerState<MomentListPage> {
  static const _debounceDelay = Duration(milliseconds: 300);

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  /// 是否正在加载下一页（底部占位 spinner 显示用）。
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// 输入防抖：停止输入 300ms 后才写入实际搜索词（触发重新请求）。
  /// 清空立即生效（恢复全量列表，无需等防抖）。
  void _onSearchChanged(String value) {
    _debounce?.cancel();
    final keyword = value.trim();
    if (keyword.isEmpty) {
      ref.read(momentSearchKeywordProvider.notifier).set('');
      setState(() {}); // 刷新清除按钮显隐
      return;
    }
    _debounce = Timer(_debounceDelay, () {
      if (!mounted) return;
      ref.read(momentSearchKeywordProvider.notifier).set(keyword);
    });
    setState(() {}); // 刷新清除按钮显隐
  }

  /// 清除按钮：清空输入并立即恢复全量列表。
  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();
    ref.read(momentSearchKeywordProvider.notifier).set('');
    setState(() {});
  }

  /// 滚动接近底部时触发加载下一页。
  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 300) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      await ref.read(momentListProvider.notifier).loadMore();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final moments = ref.watch(momentListProvider);
    // 当前标签过滤：默认清空；点卡片标签/标签管理页可设置。
    final tagFilter = ref.watch(momentTagFilterProvider);
    MomentTag? activeTag;
    if (tagFilter != null) {
      for (final t in ref.watch(tagsProvider).value ?? const <MomentTag>[]) {
        if (t.id == tagFilter) {
          activeTag = t;
          break;
        }
      }
    }
    // 搜索栏作为列表的第一个条目随内容滚动（不置顶）；加载/错误/空态下
    // 仍保留在顶部，保证无结果时也能清除关键词。
    final searchBar = _MomentSearchBar(
      controller: _searchController,
      onChanged: _onSearchChanged,
      onClear: _clearSearch,
    );
    // 过滤头：搜索栏 + 当前标签过滤 chip（可清除）。
    final header = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        searchBar,
        if (activeTag != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: InputChip(
                label: Text('#${activeTag.name}'),
                // body 与 × 都可清除过滤。
                onPressed: () =>
                    ref.read(momentTagFilterProvider.notifier).set(null),
                onDeleted: () =>
                    ref.read(momentTagFilterProvider.notifier).set(null),
              ),
            ),
          ),
      ],
    );
    return Scaffold(
      body: moments.when(
        loading: () => Column(
          children: [
            header,
            const Expanded(child: Center(child: CircularProgressIndicator())),
          ],
        ),
        error: (err, _) => Column(
          children: [
            header,
            Expanded(
              child: AsyncErrorView(
                error: err,
                onRetry: () => ref.invalidate(momentListProvider),
              ),
            ),
          ],
        ),
        data: (page) {
          final searching = ref
              .read(momentSearchKeywordProvider)
              .trim()
              .isNotEmpty;
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(momentListProvider);
              await ref.read(momentListProvider.future);
            },
            child: page.items.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      header,
                      ListTile(
                        title: Text(
                          tagFilter != null
                              ? '该标签下暂无闪记'
                              : searching
                              ? '未找到匹配的闪记'
                              : '还没有闪记，点右下角新建',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  )
                : _buildMomentList(page, header),
          );
        },
      ),
    );
  }

  /// 有数据的列表：搜索栏作为第一条（随列表滚动），其后是闪记条目。
  Widget _buildMomentList(MomentPage page, Widget searchBar) {
    final hasMore = page.items.length < page.total;
    return ListView.separated(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: page.items.length + (hasMore ? 1 : 0) + 1,
      separatorBuilder: (_, index) {
        // 搜索栏（index 0）之后不要分隔线，仅条目之间保留。
        if (index == 0) return const SizedBox.shrink();
        return const Divider(height: 1, indent: 16, endIndent: 16);
      },
      itemBuilder: (context, index) {
        if (index == 0) return searchBar;
        final itemIndex = index - 1;
        // 末尾占位：还有下一页时预留一个加载指示条。
        if (itemIndex >= page.items.length) {
          return _loadingMore
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                )
              : const SizedBox(height: 32);
        }
        final m = page.items[itemIndex];
        return InkWell(
          onTap: () => context.push('/moments/${m.id}'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: MomentCard(
              moment: m,
              onTagTap: (tag) =>
                  ref.read(momentTagFilterProvider.notifier).set(tag.id),
            ),
          ),
        );
      },
    );
  }
}

/// 搜索栏：SearchBar（Material 3）+ 前缀 Search 图标 + 内容非空时显示清除按钮。
/// 文本变化由父级 [onChanged] 处理（防抖更新搜索词），父级 setState 触发本组件
/// 重建以刷新清除按钮显隐。
class _MomentSearchBar extends StatefulWidget {
  const _MomentSearchBar({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  State<_MomentSearchBar> createState() => _MomentSearchBarState();
}

class _MomentSearchBarState extends State<_MomentSearchBar> {
  bool get _hasText => widget.controller.text.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: SearchBar(
        controller: widget.controller,
        hintText: '搜索闪记',
        padding: const WidgetStatePropertyAll(
          EdgeInsets.fromLTRB(16, 8, 16, 8),
        ),
        constraints: const BoxConstraints(
          minWidth: 0,
          maxWidth: double.infinity,
        ),
        elevation: const WidgetStatePropertyAll(0),
        backgroundColor: WidgetStatePropertyAll(scheme.surfaceContainerHighest),
        leading: const Icon(Icons.search),
        trailing: [
          if (_hasText)
            IconButton(
              icon: const Icon(Icons.close),
              tooltip: '清除',
              onPressed: widget.onClear,
            ),
        ],
        onChanged: widget.onChanged,
      ),
    );
  }
}
