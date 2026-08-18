import { describe, expect, test } from 'bun:test'
import { AI_MEMORY_MAX_LENGTH, AI_MEMORY_SINGLETON_ID, isEmptyProfile } from './ai-memory.domain'
import { toAiMemoryEntry } from './ai-memory.mappers'
import { AiMemorySchema } from './ai-memory.types'

// ---------------------------------------------------------------------------
// AI memory 模块单元测试 — 纯函数（domain/mappers）与 Zod schema。无 DB。
// ---------------------------------------------------------------------------

describe('ai-memory.domain', () => {
  test('单行固定主键', () => {
    expect(AI_MEMORY_SINGLETON_ID).toBe(1)
    expect(AI_MEMORY_MAX_LENGTH).toBe(2048)
  })

  test('isEmptyProfile：空白即视为空画像', () => {
    expect(isEmptyProfile('')).toBe(true)
    expect(isEmptyProfile('   ')).toBe(true)
    expect(isEmptyProfile('\n\t')).toBe(true)
    expect(isEmptyProfile('我喜欢喝美式')).toBe(false)
  })
})

describe('toAiMemoryEntry — row → entry', () => {
  test('时间为 ISO 字符串', () => {
    const entry = toAiMemoryEntry({
      id: 1,
      content: '我的画像',
      updatedAt: new Date('2026-08-19T10:00:00.000Z'),
    })
    expect(entry).toEqual({
      id: 1,
      content: '我的画像',
      updatedAt: '2026-08-19T10:00:00.000Z',
    })
  })
})

describe('AiMemorySchema — PUT 请求体校验', () => {
  test('content ≤2048 字符，trim 后存入', () => {
    expect(AiMemorySchema.parse({ content: '  我的画像  ' }).content).toBe('我的画像')
    expect(AiMemorySchema.parse({ content: '' }).content).toBe('')
  })

  test('合法最长 2048', () => {
    const ok = 'a'.repeat(2048)
    expect(AiMemorySchema.parse({ content: ok }).content).toBe(ok)
  })

  test('超过 2048 拒绝', () => {
    const tooLong = 'a'.repeat(2049)
    expect(() => AiMemorySchema.parse({ content: tooLong })).toThrow()
  })
})
