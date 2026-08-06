import 'package:flutter/material.dart';

class DiaryEditPage extends StatelessWidget {
  const DiaryEditPage({super.key, required this.date});
  final String date;
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(date)), body: const Center(child: Text('日记编辑（开发中）')));
}
