import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_api.dart';

// 设置页三 tab 的数据源（服务端状态，≈ TanStack Query 的 query）。
final profileProvider =
    FutureProvider<UserEntry>((ref) => ref.watch(authApiProvider).getProfile());

final credentialsProvider = FutureProvider<List<CredentialEntry>>(
    (ref) => ref.watch(authApiProvider).listCredentials());

final tokensProvider = FutureProvider<List<TokenEntry>>(
    (ref) => ref.watch(authApiProvider).listTokens());

/// ISO 时间串 → 仅日期（YYYY-MM-DD），空串兜底。
String formatDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  return iso.substring(0, 10);
}

/// 认证器 transport 的中文名。
String transportLabel(String t) => switch (t) {
      'internal' => '设备内置',
      'usb' => 'USB',
      'nfc' => 'NFC',
      'ble' => '蓝牙',
      'hybrid' => '跨设备',
      _ => t,
    };

IconData transportIcon(String t) => switch (t) {
      'internal' => Icons.phone_iphone,
      'usb' => Icons.usb,
      'nfc' => Icons.nfc,
      'ble' => Icons.bluetooth,
      'hybrid' => Icons.swap_horiz,
      _ => Icons.key,
    };
