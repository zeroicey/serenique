import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/moment/moment_providers.dart';

/// GoRouter 的 refreshListenable：认证状态变化时 bump，让 redirect 重算。
final routerRefreshProvider = Provider<ValueNotifier<int>>((ref) {
  final notifier = ValueNotifier<int>(0);
  ref.onDispose(notifier.dispose);
  return notifier;
});

/// 侧边栏 badge 计数：闪记数。轻量——拉一页 pageSize=1 读 total，
/// 不全量获取。打开抽屉时 invalidate 刷新。
final countsProvider = FutureProvider<int>((ref) async {
  final moments = await ref.watch(momentApiProvider).count();
  return moments;
});
