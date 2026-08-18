import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@earendil-works/pi-agent-core'

// ai.service 的 import 链（@/env → envSchema.parse(process.env)，以及 ./ai.tools
// → task/event/moment service → db/connection）在模块加载时解析 process.env 并要求
// DATABASE_URL / BLOB_ROOT，而 bun test 不加载 .env；单文件运行时由这里强制注入
// （同 ai.tools.test.ts 的模式）。全量运行时 env 已被其他测试文件缓存（bun test
// 单进程、先 import 先赢），注入不生效但结果一致。
//
// 本文件只测 toRenderMessages（纯函数）：不触碰 ModelRuntime / SessionManager，
// 无凭据、无磁盘也确定可测。
process.env.DATABASE_URL = 'postgresql://serenique:serenique@127.0.0.1:1/serenique'
process.env.BLOB_ROOT = '/tmp/serenique-ai-service-test'

const { toRenderMessages, tailRenderMessages, INITIAL_PAGE_SIZE } = await import('./ai.service')

describe('ai.service', () => {
  test('toRenderMessages 关联 toolResult 到 toolCall', () => {
    const messages = [
      { role: 'user', content: '创建一个任务' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '用户要建任务' },
          { type: 'text', text: '好的' },
          {
            type: 'toolCall',
            id: 't1',
            name: 'create_task',
            arguments: { title: '写周报' },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 't1',
        content: [{ type: 'text', text: '{"id":"1"}' }],
        isError: false,
      },
    ] as unknown as AgentMessage[]

    const out = toRenderMessages(messages)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      role: 'user',
      text: '创建一个任务',
      thinking: '',
      toolCalls: [],
    })
    expect(out[1].thinking).toBe('用户要建任务')
    expect(out[1].text).toBe('好的')
    expect(out[1].toolCalls).toHaveLength(1)
    expect(out[1].toolCalls[0]).toMatchObject({
      id: 't1',
      name: 'create_task',
      args: { title: '写周报' },
      result: '{"id":"1"}',
      isError: false,
    })
  })

  test('用户消息含图片内容时以 [image] 占位', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'image', data: 'x', mimeType: 'image/png' },
        ],
      },
    ] as unknown as AgentMessage[]

    const out = toRenderMessages(messages)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('看图\n[image]')
  })

  test('孤立 toolResult 被跳过、超长结果截断、错误标记透传', () => {
    const long = 'x'.repeat(3000)
    const messages = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 't9', name: 'read', arguments: {} }],
      },
      {
        role: 'toolResult',
        toolCallId: 't9',
        content: [{ type: 'text', text: long }],
        isError: true,
      },
      {
        role: 'toolResult',
        toolCallId: 'ghost',
        content: [{ type: 'text', text: '无主结果' }],
        isError: false,
      },
    ] as unknown as AgentMessage[]

    const out = toRenderMessages(messages)
    expect(out).toHaveLength(1) // toolResult 不产生独立渲染消息
    expect(out[0].toolCalls[0].result).toBe(`${'x'.repeat(2000)}…(截断)`)
    expect(out[0].toolCalls[0].isError).toBe(true)
  })
})

describe('tailRenderMessages', () => {
  // 构造 N 条 RenderMessage（user/assistant 交替）的 AgentMessage[]。
  function buildMessages(count: number): AgentMessage[] {
    const out: AgentMessage[] = []
    for (let i = 0; i < count; i++) {
      out.push({ role: 'user', content: `user-${i}` } as unknown as AgentMessage)
      out.push({
        role: 'assistant',
        content: [{ type: 'text', text: `assistant-${i}` }],
      } as unknown as AgentMessage)
    }
    return out
  }

  test('初始加载只取尾部 limit 条', () => {
    // 25 条 RenderMessage，初始取 20 条 → 返回尾部 20 条，hasMore=true
    const messages = buildMessages(25)
    const res = tailRenderMessages(messages, INITIAL_PAGE_SIZE, 0)
    expect(res.total).toBe(50)
    expect(res.messages).toHaveLength(20)
    expect(res.messages[0].text).toBe('user-15') // 第 15 条 user 起始
    expect(res.messages[19].text).toBe('assistant-24')
    expect(res.hasMore).toBe(true)
  })

  test('offset 向前加载更早批次', () => {
    const messages = buildMessages(25)
    // 初始已发 20 条，offset=20 再取 30 条 → 剩余 30 条全取完
    const res = tailRenderMessages(messages, 30, 20)
    expect(res.total).toBe(50)
    expect(res.messages).toHaveLength(30)
    expect(res.messages[0].text).toBe('user-0')
    expect(res.messages[29].text).toBe('assistant-14')
    expect(res.hasMore).toBe(false)
  })

  test('limit > total 时返回全部，hasMore=false', () => {
    const messages = buildMessages(3) // 6 条 RenderMessage
    const res = tailRenderMessages(messages, 20, 0)
    expect(res.total).toBe(6)
    expect(res.messages).toHaveLength(6)
    expect(res.hasMore).toBe(false)
  })

  test('空会话返回空数组', () => {
    const res = tailRenderMessages([], 20, 0)
    expect(res.total).toBe(0)
    expect(res.messages).toHaveLength(0)
    expect(res.hasMore).toBe(false)
  })

  test('toolCall/toolResult 关联不被分页截断', () => {
    // assistant 的 toolCall + 紧跟的 toolResult 在 jsonl 里相邻，转换后关联进
    // 同一 RenderMessage，分页不会拆散。
    const messages = [
      { role: 'user', content: '问题' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '调用工具' },
          { type: 'toolCall', id: 't1', name: 'noop', arguments: {} },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 't1',
        content: [{ type: 'text', text: '结果' }],
        isError: false,
      },
      { role: 'user', content: 'thanks' },
    ] as unknown as AgentMessage[]

    // limit=1 只取尾部 1 条 RenderMessage（最后的 user），assistant+toolCall
    // 整体在同一条 RenderMessage 里，不会被截断到只剩 toolCall 没有 result
    const res = tailRenderMessages(messages, 1, 0)
    expect(res.messages).toHaveLength(1)
    expect(res.messages[0].text).toBe('thanks')
    expect(res.hasMore).toBe(true)
    // 上一条 assistant 的 toolCall 有 result（关联完整）
    const res2 = tailRenderMessages(messages, 2, 0)
    expect(res2.messages[0].toolCalls[0].result).toBe('结果')
  })
})
