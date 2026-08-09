import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_exception.dart';
import '../auth/auth_api.dart';
import 'settings_providers.dart';

/// API 令牌 tab（GitHub PAT 模式）：列表（仅 prefix）/ 创建 / 撤销。
/// 创建后明文仅显示一次：弹窗展示 + 复制按钮，关闭即清除内存中的明文。
class TokensTab extends ConsumerStatefulWidget {
  const TokensTab({super.key});

  @override
  ConsumerState<TokensTab> createState() => _TokensTabState();
}

class _TokensTabState extends ConsumerState<TokensTab> {
  bool _createOpen = false;
  final _nameController = TextEditingController();

  /// 创建成功后的明文（仅内存保存一次，关闭弹窗即清空）。
  String? _plaintext;
  bool _creating = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    setState(() => _creating = true);
    try {
      final result = await ref.read(authApiProvider).createToken(name);
      if (!mounted) return;
      setState(() {
        _createOpen = false;
        _nameController.clear();
        _plaintext = result.plaintext;
      });
      ref.invalidate(tokensProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(humanizeError(e))));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _copyPlaintext() async {
    final plaintext = _plaintext;
    if (plaintext == null) return;
    try {
      await Clipboard.setData(ClipboardData(text: plaintext));
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('令牌已复制到剪贴板')));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('复制失败，请手动选择复制')));
    }
  }

  Future<void> _confirmRevoke(TokenEntry token) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('撤销 API 令牌'),
        content: Text(
          '确定撤销「${token.name}」吗？撤销后使用该令牌的 CLI / 脚本将立即失效。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('撤销'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(authApiProvider).revokeToken(token.id);
      ref.invalidate(tokensProvider);
    } catch (e) {
      if (!mounted) return;
      // 已撤销重复撤销 → 404 服务端文案透传
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(tokensProvider);
    return switch (tokens) {
      AsyncValue(hasValue: true, :final value?) => _list(context, value),
      AsyncValue(hasError: true) => _errorRetry(
          () => ref.invalidate(tokensProvider),
          '加载令牌失败',
        ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }

  Widget _list(BuildContext context, List<TokenEntry> items) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '用于 CLI / 脚本 / 移动端的访问凭证，泄露后可在列表中单独撤销。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: () => setState(() => _createOpen = true),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新建令牌'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Text(
              '暂无令牌',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          )
        else
          for (final token in items)
            _TokenTile(
              token: token,
              onRevoke: token.isRevoked ? null : () => _confirmRevoke(token),
            ),
        if (_createOpen) _createDialog(context),
        if (_plaintext != null) _plaintextDialog(context),
      ],
    );
  }

  Widget _createDialog(BuildContext context) {
    return AlertDialog(
      title: const Text('新建 API 令牌'),
      content: TextField(
        controller: _nameController,
        maxLength: 100,
        autofocus: true,
        decoration: const InputDecoration(
          hintText: '例如：macbook',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => setState(() => _createOpen = false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _creating ? null : _create,
          child: Text(_creating ? '创建中…' : '创建'),
        ),
      ],
    );
  }

  /// 明文仅显示一次：关闭即从内存清空。
  Widget _plaintextDialog(BuildContext context) {
    return AlertDialog(
      title: const Text('令牌已创建'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('令牌明文仅显示这一次，关闭后无法再次查看。请立即复制并妥善保存。'),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: SelectableText(
              _plaintext!,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => setState(() => _plaintext = null),
          child: const Text('我已知晓，关闭'),
        ),
        FilledButton.icon(
          onPressed: _copyPlaintext,
          icon: const Icon(Icons.copy, size: 18),
          label: const Text('复制令牌'),
        ),
      ],
    );
  }

  Widget _errorRetry(VoidCallback retry, String text) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(text),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: retry, child: const Text('重试')),
        ],
      ),
    );
  }
}

class _TokenTile extends StatelessWidget {
  const _TokenTile({required this.token, required this.onRevoke});

  final TokenEntry token;

  /// null = 已撤销，不显示撤销按钮。
  final VoidCallback? onRevoke;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: token.isRevoked
          ? scheme.surfaceContainerLow.withValues(alpha: 0.5)
          : null,
      child: ListTile(
        leading: Icon(
          Icons.key_outlined,
          color: token.isRevoked
              ? scheme.outline
              : scheme.primary,
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(token.name, overflow: TextOverflow.ellipsis),
            ),
            if (token.isRevoked) ...[
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('已撤销', style: Theme.of(context).textTheme.labelSmall),
              ),
            ],
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'serenique_${token.prefix}…',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(fontFamily: 'monospace'),
            ),
            Text(
              '创建于 ${formatDate(token.createdAt)}'
              '${token.lastUsedAt != null ? ' · 最近使用 ${formatDate(token.lastUsedAt)}' : ''}'
              '${token.revokedAt != null ? ' · 撤销于 ${formatDate(token.revokedAt)}' : ''}',
            ),
          ],
        ),
        trailing: onRevoke == null
            ? null
            : IconButton(
                icon: Icon(Icons.delete_outline, color: scheme.error),
                tooltip: '撤销',
                onPressed: onRevoke,
              ),
      ),
    );
  }
}
