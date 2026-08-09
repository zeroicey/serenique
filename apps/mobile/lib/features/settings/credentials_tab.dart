import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_exception.dart';
import '../auth/auth_api.dart';
import '../auth/auth_providers.dart';
import 'settings_providers.dart';

/// 登录凭证 tab：列出已注册的通行密钥，支持重命名（PATCH /auth/credentials/:id）、
/// 删除（删最后一把 409 由服务端文案提示）与登录态添加新设备（register ceremony）。
class CredentialsTab extends ConsumerStatefulWidget {
  const CredentialsTab({super.key});

  @override
  ConsumerState<CredentialsTab> createState() => _CredentialsTabState();
}

class _CredentialsTabState extends ConsumerState<CredentialsTab> {
  bool _addingDevice = false;

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _addDevice() async {
    setState(() => _addingDevice = true);
    try {
      final error =
          await ref.read(authControllerProvider.notifier).registerDevice();
      if (!mounted) return;
      if (error != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error)));
        return;
      }
      ref.invalidate(credentialsProvider);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('登录凭证添加成功')));
    } finally {
      if (mounted) setState(() => _addingDevice = false);
    }
  }

  Future<void> _confirmDelete(CredentialEntry cred) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除登录凭证'),
        content: Text(
          '确定删除「${cred.deviceLabel ?? '未命名设备'}」吗？删除后该设备将无法再用此通行密钥登录。',
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
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(authApiProvider).deleteCredential(cred.id);
      ref.invalidate(credentialsProvider);
    } catch (e) {
      if (!mounted) return;
      // 409（至少保留一把）等服务端文案原样透传
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }

  Future<void> _promptRename(CredentialEntry cred) async {
    final controller = TextEditingController(text: cred.deviceLabel ?? '');
    final label = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('重命名登录凭证'),
        content: TextField(
          controller: controller,
          maxLength: 50,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '例如：iPhone · Apple',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (label == null || !mounted) return;
    try {
      await ref
          .read(authApiProvider)
          .renameCredential(cred.id, label.isEmpty ? null : label);
      ref.invalidate(credentialsProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final credentials = ref.watch(credentialsProvider);
    return switch (credentials) {
      AsyncValue(hasValue: true, :final value?) => _list(context, value),
      AsyncValue(hasError: true) => _errorRetry(
          () => ref.invalidate(credentialsProvider),
          '加载登录凭证失败',
        ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }

  Widget _list(BuildContext context, List<CredentialEntry> items) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '共 ${items.length} 把登录凭证，删除前请确认至少保留一把。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: _addingDevice ? null : _addDevice,
              icon: _addingDevice
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.key, size: 18),
              label: Text(_addingDevice ? '正在创建…' : '添加通行密钥'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Text(
              '暂无登录凭证',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          )
        else
          for (final cred in items)
            _CredentialTile(
              credential: cred,
              onRename: () => _promptRename(cred),
              onDelete: () => _confirmDelete(cred),
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

class _CredentialTile extends StatelessWidget {
  const _CredentialTile({
    required this.credential,
    required this.onRename,
    required this.onDelete,
  });

  final CredentialEntry credential;
  final VoidCallback onRename;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final transports = credential.transports ?? const <String>[];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(Icons.key, color: scheme.primary),
        title: Text(credential.deviceLabel ?? '未命名设备'),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '添加于 ${formatDate(credential.createdAt)}'
              '${credential.lastUsedAt != null ? ' · 最近使用 ${formatDate(credential.lastUsedAt)}' : ''}',
            ),
            if (transports.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final t in transports)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(transportIcon(t), size: 14),
                          const SizedBox(width: 2),
                          Text(
                            transportLabel(t),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                  ],
                ),
              ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: '重命名',
              onPressed: onRename,
            ),
            IconButton(
              icon: Icon(Icons.delete_outline, color: scheme.error),
              tooltip: '删除',
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
