import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// GoRouter 的 refreshListenable：认证状态变化时 bump，让 redirect 重算。
final routerRefreshProvider = Provider<ValueNotifier<int>>((ref) {
  final notifier = ValueNotifier<int>(0);
  ref.onDispose(notifier.dispose);
  return notifier;
});
