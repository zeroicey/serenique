// AI 模块 provider 定义。客户端工厂可被测试 override（注入假通道）。
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../auth/auth_providers.dart';
import 'ai_client.dart';
import 'ai_controller.dart';

final aiClientFactoryProvider = Provider<AiClient Function()>((ref) {
  return () => AiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authControllerProvider).token,
  );
});

final aiControllerProvider =
    NotifierProvider<AiController, AiState>(AiController.new);
