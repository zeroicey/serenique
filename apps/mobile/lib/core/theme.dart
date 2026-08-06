import 'package:flutter/material.dart';

/// Material 3 主题：品牌色种子 + 亮/暗两套，跟系统。
class AppTheme {
  AppTheme._();

  static const Color seed = Color(0xFF6750A4);

  static ThemeData light() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
      );

  static ThemeData dark() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
      );
}
