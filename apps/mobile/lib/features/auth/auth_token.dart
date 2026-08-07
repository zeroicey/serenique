/// 密钥输入的校验与修复（纯函数，可单测）。
///
/// 背景：从微信等来源复制的密钥可能被 UTF-16 字节序错位损坏——ASCII 十六进制串
/// 被编码成低字节为 0 的 CJK 字形（如 U+3500），这类字符无法放进 HTTP 请求头
/// （请求头只允许 ASCII），Dio 会在发送前抛 `FormatException`，被兜底成令人困惑的
/// 「未知错误，请稍后重试」。这里把可确定的错位还原，剩下的交给校验拦截。
library;

/// 还原被 UTF-16 字节序错位损坏的密钥；无损时返回原串，不可修复返回 null。
///
/// 损坏模式：原 ASCII 字符 `X` 被编码成 `U+XX00`（高字节为原字符、低字节为 0 的
/// CJK 字形）。逐字符取高字节即可还原；普通 ASCII 原样保留；其它字符视为不可修复。
String? repairTokenEncoding(String token) {
  final out = StringBuffer();
  for (final rune in token.runes) {
    if (rune >= 0x3000 && rune <= 0x9fff && (rune & 0xff) == 0) {
      out.writeCharCode(rune >> 8);
    } else if (rune < 0x80) {
      out.writeCharCode(rune);
    } else {
      return null;
    }
  }
  return out.toString();
}

/// 密钥必须能放进 HTTP 请求头：非空且仅含 ASCII 可见字符（0x21–0x7E）。
bool isHeaderSafeToken(String token) =>
    token.isNotEmpty && token.runes.every((r) => r >= 0x21 && r <= 0x7e);
