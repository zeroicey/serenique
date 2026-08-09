import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config.dart';
import 'auth_providers.dart';

/// 登录页：门禁探测三态驱动 UI（镜像 Web 登录页）。
/// - 引导期（凭证计数 0）：首次使用卡片 → 浏览器打开 /setup 创建首个通行密钥
/// - 已有凭证：仅「使用通行密钥登录」按钮
/// - 后端错误：登录按钮 + 点击失败 toast
class LoginPage extends ConsumerWidget {
  const LoginPage({super.key});

  Future<void> _login(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final error = await ref.read(authControllerProvider.notifier).loginWithPasskey();
    if (!context.mounted) return;
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    // 登录成功：显式进主界面（redirect 也会把已认证的 /login 重定向走）
    context.go('/moments');
  }

  Future<void> _copySetupUrl(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: AppConfig.setupUrl));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('链接已复制')));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gate = ref.watch(registerGateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: switch (gate) {
            AsyncValue(hasValue: false) =>
              const Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            AsyncValue(:final value?) => _gateView(context, ref, value),
            _ => _gateView(context, ref, RegisterGateStatus.error),
          },
        ),
      ),
    );
  }

  Widget _gateView(
    BuildContext context,
    WidgetRef ref,
    RegisterGateStatus gate,
  ) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (gate == RegisterGateStatus.bootstrap) ...[
            _FirstUseCard(onCopy: () => _copySetupUrl(context)),
            const SizedBox(height: 16),
          ],
          Text(
            gate == RegisterGateStatus.bootstrap
                ? '创建完成后，用通行密钥登录'
                : '使用通行密钥登录',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _login(context, ref),
            icon: const Icon(Icons.fingerprint),
            label: const Text('使用通行密钥登录'),
          ),
          if (gate == RegisterGateStatus.error) ...[
            const SizedBox(height: 12),
            Text(
              '无法连接服务器，请检查网络后重试',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

/// 首次使用卡片：说明 users 已由部署者创建，首个通行密钥须在浏览器打开
/// 前端 /setup 页面创建（不提供 SETUP_TOKEN 输入，决策④）。
class _FirstUseCard extends StatelessWidget {
  const _FirstUseCard({required this.onCopy});

  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.secondaryContainer.withValues(alpha: 0.4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '首次使用 Serenique？',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(color: scheme.onSecondaryContainer),
            ),
            const SizedBox(height: 8),
            Text(
              '你的账户已由部署者创建。请先在浏览器中打开下面的链接创建第一个通行密钥，然后再回来登录。',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSecondaryContainer),
            ),
            const SizedBox(height: 12),
            // 完整 URL 展示，可点击复制（移动端不便手动输入长域名）。
            InkWell(
              onTap: onCopy,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        AppConfig.setupUrl,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: scheme.primary),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.copy, size: 16, color: scheme.primary),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
