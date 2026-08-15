import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 新建闪记文字草稿存取抽象：生产用 SharedPreferences，测试注入内存假实现。
abstract class MomentDraftStorage {
  Future<String?> read();
  Future<void> write(String text);
  Future<void> delete();
}

/// 生产实现：SharedPreferences（文字草稿，非敏感数据，不需要 secure storage）。
class SharedPrefsMomentDraftStorage implements MomentDraftStorage {
  SharedPrefsMomentDraftStorage([SharedPreferences? prefs]) : _prefs = prefs;

  static const _key = 'moment_draft_text';
  SharedPreferences? _prefs;

  Future<SharedPreferences> get _instance async =>
      _prefs ??= await SharedPreferences.getInstance();

  @override
  Future<String?> read() async => (await _instance).getString(_key);

  @override
  Future<void> write(String text) async =>
      (await _instance).setString(_key, text);

  @override
  Future<void> delete() async => (await _instance).remove(_key);
}

/// 草稿存储 provider：测试用 overrideWithValue 注入内存假实现。
final momentDraftStorageProvider = Provider<MomentDraftStorage>(
  (ref) => SharedPrefsMomentDraftStorage(),
);
