import { createHash, randomBytes } from 'node:crypto'
import { secretsEqual } from '@/modules/auth/auth.domain'

// ---------------------------------------------------------------------------
// Tokens domain — pure token generation / hashing rules. No DB / IO imports.
//
// 明文只出现一次（创建响应），库中只存 SHA-256 hex。prefix 取随机段前 8 位
// 用于列表展示识别 —— 品牌前缀 serenique_ 是恒定值，随机段才是身份信息
// （对齐 GitHub PAT 的「前缀 + 随机头」展示惯例）。
// ---------------------------------------------------------------------------

export const TOKEN_PREFIX = 'serenique_'
export const TOKEN_RANDOM_BYTES = 32 // base64url → 43 字符
export const TOKEN_PREFIX_LENGTH = 8 // 列表展示用的明文片段长度

/** 生成全新令牌明文：serenique_ + 32 字节 base64url。 */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_RANDOM_BYTES).toString('base64url')
}

/** 令牌 → SHA-256 hex（仅此形式落库）。 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** 列表展示用前缀：随机段的前 8 位。 */
export function prefixOf(plaintext: string): string {
  return plaintext.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + TOKEN_PREFIX_LENGTH)
}

/** 常量时间比对：明文 hash 与库中 hash。 */
export function tokenMatches(plaintext: string, storedHash: string): boolean {
  return secretsEqual(hashToken(plaintext), storedHash)
}
