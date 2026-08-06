import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 全局占位：登录密钥。auth 后端落地后改为从 flutter_secure_storage 读取。
final authTokenProvider = Provider<String?>((ref) => null);
