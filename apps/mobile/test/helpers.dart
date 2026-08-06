import 'package:serenique_mobile/features/auth/token_storage.dart';

/// 测试用内存密钥存储。
class FakeTokenStorage implements TokenStorage {
  FakeTokenStorage([this.value]);

  String? value;
  int writes = 0;
  int deletes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
    writes++;
  }

  @override
  Future<void> delete() async {
    value = null;
    deletes++;
  }
}
