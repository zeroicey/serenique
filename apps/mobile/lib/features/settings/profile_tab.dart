import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_exception.dart';
import '../auth/auth_api.dart';
import 'settings_providers.dart';

/// 个人信息 tab（/users/me）：name / email / birthday。
/// 空字段提交 ''，服务端归一化为 null（清除）；birthday 用 showDatePicker。
class ProfileTab extends ConsumerStatefulWidget {
  const ProfileTab({super.key});

  @override
  ConsumerState<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends ConsumerState<ProfileTab> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _birthdayController = TextEditingController();
  String? _birthday; // YYYY-MM-DD；null = 未设置
  bool _saving = false;
  bool _loaded = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _birthdayController.dispose();
    super.dispose();
  }

  /// 资料加载完成后回填表单（保存成功后 invalidate 会再次触发回填）。
  void _fill(UserEntry? profile) {
    if (profile == null || _loaded) return;
    _loaded = true;
    _name.text = profile.name ?? '';
    _email.text = profile.email ?? '';
    _birthday = profile.birthday;
    _birthdayController.text = _birthday ?? '';
  }

  Future<void> _pickBirthday() async {
    final now = DateTime.now();
    final initial = _birthday == null ? null : DateTime.tryParse(_birthday!);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime(now.year - 30, now.month, now.day),
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked == null || !mounted) return;
    setState(() {
      _birthday = DateFormat('yyyy-MM-dd').format(picked);
      _birthdayController.text = _birthday!;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(authApiProvider).updateProfile(
            name: _name.text,
            email: _email.text,
            birthday: _birthday ?? '',
          );
      _loaded = false; // 让 invalidate 后的新资料重新回填
      ref.invalidate(profileProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('个人信息已更新')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(humanizeError(e))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider);
    if (profile.hasValue) _fill(profile.value);
    return switch (profile) {
      AsyncValue(hasValue: true, :final value?) => _form(value),
      AsyncValue(hasError: true) => _errorRetry(
          () => ref.invalidate(profileProvider),
          '加载个人信息失败',
        ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }

  Widget _form(UserEntry profile) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _name,
          maxLength: 100,
          decoration: const InputDecoration(
            labelText: '姓名',
            hintText: '你的称呼',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _email,
          maxLength: 200,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: '邮箱',
            hintText: 'you@example.com',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          readOnly: true,
          onTap: _pickBirthday,
          controller: _birthdayController,
          decoration: InputDecoration(
            labelText: '生日',
            hintText: '点击选择',
            border: const OutlineInputBorder(),
            suffixIcon: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_birthday != null)
                  IconButton(
                    icon: const Icon(Icons.clear),
                    tooltip: '清除生日',
                    onPressed: () => setState(() {
                      _birthday = null;
                      _birthdayController.clear();
                    }),
                  ),
                const Icon(Icons.calendar_today_outlined, size: 18),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('保存'),
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
