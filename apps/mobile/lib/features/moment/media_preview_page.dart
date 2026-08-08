// lib/features/moment/media_preview_page.dart（占位，Task 8 替换）
import 'package:flutter/material.dart';
import 'moment_models.dart';

class MediaPreviewPage extends StatelessWidget {
  const MediaPreviewPage({super.key, required this.attachments, this.initialIndex = 0});
  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: SizedBox.shrink());
  }
}
