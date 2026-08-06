import 'package:flutter/material.dart';

/// 启动闪屏：读 Keychain 期间短暂展示。
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
