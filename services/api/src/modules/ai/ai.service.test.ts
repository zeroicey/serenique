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

const {
  toRenderMessages,
  tailRenderMessages,
  nextOlderPage,
  sessionPagination,
  INITIAL_PAGE_SIZE,
} = await import('./ai.service')

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

describe('nextOlderPage（向上懒加载游标）', () => {
  // 构造 N 条 RenderMessage（user/assistant 交替）的 AgentMessage[]，同上面 helper。
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

  test('基本：从 anchor 往前取 limit 条，nextAnchor 刷新', () => {
    const messages = buildMessages(25) // 50 条 RenderMessage
    // 初始已发尾部 20 条（[30..49]），anchor=30
    const page = nextOlderPage(messages, 30, 30)
    expect(page.total).toBe(50)
    expect(page.messages).toHaveLength(30)
    expect(page.messages[0].text).toBe('user-0')
    expect(page.messages[29].text).toBe('assistant-14')
    expect(page.hasMore).toBe(false)
    expect(page.nextAnchor).toBe(0)
  })

  test('核心回归：turn 尾部追加后 load_more 与已持有消息不重叠', () => {
    // 原始会话 25 对（50 条 RenderMessage），已发尾部 20 条 [30..49]，anchor=30
    const initial = tailRenderMessages(buildMessages(25), INITIAL_PAGE_SIZE, 0)
    const anchor = initial.total - initial.messages.length // 30
    const held = [...initial.messages] // 客户端已有 [30..49]

    // 一轮 turn 将会话追加到 27 对（54 条）；客户端同时收到流式追加的尾部 4 条 [50..53]
    const grown = buildMessages(27)
    const streamed = tailRenderMessages(grown, 4, 0).messages // [50..53]
    held.push(...streamed) // 客户端现在 [30..53]

    // 用户向上滚动 → load_more：anchor 仍为 30（前端边界稳定，不随尾部增长漂移）
    const page = nextOlderPage(grown, 30, anchor)
    expect(page.total).toBe(54)
    expect(page.messages).toHaveLength(30)
    expect(page.messages[0].text).toBe('user-0')
    expect(page.messages[29].text).toBe('assistant-14')
    expect(page.hasMore).toBe(false)
    expect(page.nextAnchor).toBe(0)

    // 拼接（历史批次 ++ 已持有）后覆盖全部且不重复
    const merged = [...page.messages, ...held]
    const texts = merged.map((m) => m.text)
    expect(new Set(texts).size).toBe(texts.length)
    expect(merged).toHaveLength(54)
    expect(merged[0].text).toBe('user-0')
    expect(merged[53].text).toBe('assistant-26')
  })

  test('anchor=total 时钳到 total 并 hasMore', () => {
    const messages = buildMessages(25) // 50 条
    const page = nextOlderPage(messages, 30, 50)
    expect(page.total).toBe(50)
    expect(page.messages).toHaveLength(30)
    expect(page.messages[0].text).toBe('user-10')
    expect(page.messages[29].text).toBe('assistant-24')
    expect(page.hasMore).toBe(true)
    expect(page.nextAnchor).toBe(20)
  })

  test('anchor=0 时无更多，返回空批次', () => {
    const messages = buildMessages(25)
    const page = nextOlderPage(messages, 30, 0)
    expect(page.total).toBe(50)
    expect(page.messages).toHaveLength(0)
    expect(page.hasMore).toBe(false)
    expect(page.nextAnchor).toBe(0)
  })
})

describe('sessionPagination（会话就绪/切换/新建的分页基线）', () => {
  // 与 handler sessionPayload/onOpen 的基线语义一致：只发尾部 INITIAL_PAGE_SIZE 条，
  // anchor = tail.total - tail.messages.length（客户端最早持有下标）。切会话/建新会话
  // 都会重新走 sessionPagination，即基线随当前 total 重算（评审 FIX B）。
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

  test('长会话：尾部 20 条 + anchor=30（尾部起点）', () => {
    const page = sessionPagination(buildMessages(25)) // 50 条 RenderMessage
    expect(page.total).toBe(50)
    expect(page.messages).toHaveLength(20)
    expect(page.messages[0].text).toBe('user-15')
    expect(page.hasMore).toBe(true)
    expect(page.anchor).toBe(30)
  })

  test('短会话（全部可下发）：anchor=0，hasMore=false', () => {
    const page = sessionPagination(buildMessages(5)) // 10 条 RenderMessage
    expect(page.total).toBe(10)
    expect(page.messages).toHaveLength(10)
    expect(page.hasMore).toBe(false)
    expect(page.anchor).toBe(0)
  })

  test('空会话：anchor=0，hasMore=false', () => {
    const page = sessionPagination([])
    expect(page.total).toBe(0)
    expect(page.messages).toHaveLength(0)
    expect(page.hasMore).toBe(false)
    expect(page.anchor).toBe(0)
  })

  test('基线随当前 total 重算（切回已增长的会话，游标不跨会话泄漏）', () => {
    // 首次：50 条 → 基线 30
    expect(sessionPagination(buildMessages(25)).anchor).toBe(30)
    // 该会话在别处被追加（54 条）后再切回来：基线跟随新 total（34），
    // 而不是沿用旧游标 30——保证新切片 [34-20, 34) 与客户端按新尾部重载不重叠。
    const page = sessionPagination(buildMessages(27))
    expect(page.total).toBe(54)
    expect(page.anchor).toBe(34)
    expect(page.messages[0].text).toBe('user-17')
  })
})

describe('分页状态机（sessionPagination → nextOlderPage 多次翻页 → 终态）', () => {
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

  test('初始基线 → 两批 load_more 严格递减不重叠 → 终态 hasMore=false', () => {
    // 会话 30 对（60 条 RenderMessage），初始发尾部 20 条 [40..59]，anchor=40
    const init = sessionPagination(buildMessages(30))
    expect(init.anchor).toBe(40)
    const held = [...init.messages]
    let anchor = init.anchor

    // 第一批 load_more（limit 30）：返回 [10..40)，nextAnchor=10
    const p1 = nextOlderPage(buildMessages(30), 30, anchor)
    expect(p1.messages).toHaveLength(30)
    expect(p1.messages[0].text).toBe('user-5')
    expect(p1.hasMore).toBe(true)
    held.unshift(...p1.messages)
    anchor = p1.nextAnchor

    // 第二批 load_more（limit 30）：返回 [0..10)，终态
    const p2 = nextOlderPage(buildMessages(30), 30, anchor)
    expect(p2.messages).toHaveLength(10)
    expect(p2.messages[0].text).toBe('user-0')
    expect(p2.messages[9].text).toBe('assistant-4')
    expect(p2.hasMore).toBe(false)
    expect(p2.nextAnchor).toBe(0)
    held.unshift(...p2.messages)

    // 两批 + 初始尾部拼接 = 全覆盖 60 条、无重复
    expect(held).toHaveLength(60)
    const texts = held.map((m) => m.text)
    expect(new Set(texts).size).toBe(60)
    expect(held[0].text).toBe('user-0')
    expect(held[59].text).toBe('assistant-29')
  })
})
