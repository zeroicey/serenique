import { describe, expect, test } from 'bun:test'
import { buildSystemPrompt } from './ai.system-prompt'

describe('ai.system-prompt', () => {
  const now = new Date('2026-08-09T10:00:00+08:00')
  const prompt = buildSystemPrompt(now)

  test('包含当前日期与星期', () => {
    expect(prompt).toContain('2026-08-09')
    expect(prompt).toContain('星期日')
  })

  test('说明工具使用方式', () => {
    expect(prompt).toContain('create_task')
    expect(prompt).toContain('create_event')
  })

  test('要求中文回复', () => {
    expect(prompt).toContain('中文')
  })
})
