import 'package:flutter/material.dart';

class MomentDetailPage extends StatelessWidget {
  const MomentDetailPage({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(id)), body: const Center(child: Text('闪记详情（开发中）')));
}
