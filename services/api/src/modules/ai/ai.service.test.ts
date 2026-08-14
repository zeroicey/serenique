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

const { toRenderMessages } = await import('./ai.service')

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
