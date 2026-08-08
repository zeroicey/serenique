import 'package:collection/collection.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';

import '../moment_models.dart';

enum AttachmentPickSource { photo, video, file, gallery }

/// 弹出底部选择框（微信样式）。返回选中的附件；取消返回 null。
Future<List<PickedAttachment>?> showAttachmentPickerSheet(BuildContext context) async {
  final source = await showModalBottomSheet<AttachmentPickSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('拍照'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.photo)),
          ListTile(leading: const Icon(Icons.videocam_outlined), title: const Text('录像'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.video)),
          ListTile(leading: const Icon(Icons.folder_open), title: const Text('选文件'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.file)),
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('从手机相册选择'), onTap: () => Navigator.pop(ctx, AttachmentPickSource.gallery)),
          const Divider(height: 1),
          ListTile(title: const Text('取消'), onTap: () => Navigator.pop(ctx)),
        ],
      ),
    ),
  );
  if (source == null || !context.mounted) return null;
  return _pickFromSource(source);
}

Future<List<PickedAttachment>?> _pickFromSource(AttachmentPickSource source) async {
  switch (source) {
    case AttachmentPickSource.photo:
      final x = await ImagePicker().pickImage(source: ImageSource.camera);
      if (x == null) return null;
      return [await _fromXFile(x)];
    case AttachmentPickSource.video:
      final x = await ImagePicker().pickVideo(source: ImageSource.camera);
      if (x == null) return null;
      return [await _fromXFile(x)];
    case AttachmentPickSource.gallery:
      final xs = await ImagePicker().pickMultiImage();
      if (xs.isEmpty) return null;
      return [for (final x in xs) await _fromXFile(x)];
    case AttachmentPickSource.file:
      final result = await FilePicker.pickFiles(type: FileType.media);
      final f = result?.files.singleOrNull;
      if (f == null) return null;
      final bytes = await f.readAsBytes();
      return [PickedAttachment(bytes: bytes, filename: f.name, mimeType: _mimeFromName(f.name), localPath: f.path)];
  }
}

Future<PickedAttachment> _fromXFile(XFile x) async {
  final bytes = await x.readAsBytes();
  return PickedAttachment(bytes: bytes, filename: x.name, mimeType: lookupMimeType(x.path) ?? 'application/octet-stream', localPath: x.path);
}

String _mimeFromName(String name) =>
    lookupMimeType(name) ?? 'application/octet-stream';
