import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// 全局测试环境准备：CachedNetworkImage 的 DiskCacheManager 依赖 path_provider
/// 与 sqflite（数据库索引），widget 测试没有插件实现。这里统一：
///   1) mock path_provider 三个常用目录 channel 到系统临时目录；
///   2) 初始化 FFI 数据库工厂（sqfliteFfiInit + databaseFactoryFfi）。
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  // 每次测试运行用唯一临时目录：CachedNetworkImage 磁盘缓存 db（sqflite_common_ffi）
  // 在 systemTemp 持久化会跨运行残留（UNIQUE constraint failed: cacheObject.key）。
  final cacheDir = await Directory.systemTemp.createTemp('serenique_test_');
  const channel = MethodChannel('plugins.flutter.io/path_provider');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    switch (call.method) {
      case 'getTemporaryDirectory':
      case 'getApplicationSupportDirectory':
      case 'getApplicationDocumentsDirectory':
        return cacheDir.path;
      default:
        return null;
    }
  });
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;
  await testMain();
}