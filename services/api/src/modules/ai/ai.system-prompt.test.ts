import { describe, expect, test } from 'bun:test'
import { buildBaseSystemPrompt, buildSystemPrompt } from './ai.system-prompt'

// ---------------------------------------------------------------------------
// L1 系统提示词测试 — 人格化定稿后关键断言：
//   - 温柔俏皮但克制（Q4）
//   - 不含日期（日期属于 L3 动态快照，会话跨天日期不会过期）
//   - 保留工具用法速查与中文要求
// ---------------------------------------------------------------------------

describe('ai.system-prompt (L1 人格化)', () => {
  const prompt = buildBaseSystemPrompt()

  test('人设：宁序、温柔俏皮、女生、生活小助手', () => {
    expect(prompt).toContain('宁序')
    expect(prompt).toContain('温柔俏皮')
    expect(prompt).toContain('女生')
    expect(prompt).toContain('小助手')
  })

  test('克制：工作优先，不卖萌过度', () => {
    expect(prompt).toContain('克制')
    expect(prompt).toContain('工作优先')
    expect(prompt).toContain('不卖萌过度')
  })

  test('不含静态注入的“当前日期”（日期在 L3 每轮刷新，L1 不变）', () => {
    // L1 里出现的 YYYY-MM-DD / ISO 示例是工具参数格式说明（必要），并非注入
    // 当前日期。要排除的是「当前日期：…」式的静态时间戳与「现在是」描述。
    expect(prompt).not.toMatch(/当前日期[：:]/)
    expect(prompt).not.toMatch(/现在是 \d{4}-\d{2}-\d{2}/)
  })

  test('说明工具使用方式', () => {
    expect(prompt).toContain('create_task')
    expect(prompt).toContain('create_event')
    expect(prompt).toContain('set_habit_daily')
    expect(prompt).toContain('get_habit_overview')
  })

  test('指出动态快照已注入，不必重复调工具', () => {
    expect(prompt).toContain('动态信息')
    expect(prompt).toContain('直接使用')
  })

  test('要求中文回复', () => {
    expect(prompt).toContain('中文')
  })

  test('buildSystemPrompt 兼容旧签名（等价于 buildBaseSystemPrompt）', () => {
    expect(buildSystemPrompt(new Date('2026-08-19T12:00:00+08:00'))).toBe(prompt)
  })
})
