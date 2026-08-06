import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_exception.dart';
import 'auth_providers.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final token = _controller.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入密钥')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final error = await ref.read(authControllerProvider.notifier).login(token);
      if (error != null && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error)));
      }
      // 成功：redirect 已通过 routerRefresh 重算，自动进 /moments
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _logout() async {
    await ref.read(authControllerProvider.notifier).logout();
    // redirect 重算 → /login（已登录态变表单态）
  }

  String _mask(String token) {
    if (token.length <= 8) return '*' * token.length;
    return '${token.substring(0, 4)}…${token.substring(token.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: Center(
        child: auth.isAuthenticated ? _loggedIn(auth.token!) : _loginForm(),
      ),
    );
  }

  Widget _loginForm() {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('输入你的 Serenique 密钥',
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              obscureText: true,
              decoration: const InputDecoration(
                  hintText: 'AUTH_TOKEN', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('登录'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _loggedIn(String token) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_outline, size: 48),
          const SizedBox(height: 12),
          const Text('已登录'),
          const SizedBox(height: 4),
          Text(_mask(token), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: _logout, child: const Text('退出登录')),
        ],
      ),
    );
  }
}
