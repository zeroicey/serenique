import { describe, expect, test } from 'bun:test'

// ai.handler 的 import 链（→ ai.service → @/env → envSchema.parse(process.env)，
// 以及 → auth.middleware → db/connection）在模块加载时解析 process.env 并要求
// DATABASE_URL / BLOB_ROOT，而 bun test 不加载 .env；单文件运行时由这里强制
// 注入，再动态 import（同 ai.service.test.ts 的模式）。全量运行时 env 已被
// 其他测试文件缓存（bun test 单进程、先 import 先赢），注入不生效但结果一致。
process.env.DATABASE_URL = 'postgresql://serenique:serenique@127.0.0.1:1/serenique'
process.env.BLOB_ROOT = '/tmp/serenique-ai-handler-test'

const { isAllowedOrigin } = await import('./ai.handler')

describe('ai.handler', () => {
  const allowed = ['https://serenique.pages.dev', 'http://localhost:5173', 'http://localhost:3000']

  test('白名单内放行', () => {
    expect(isAllowedOrigin('https://serenique.pages.dev', allowed)).toBe(true)
  })

  test('同源（无 Origin 头）放行（本地/dev 工具场景）', () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(true)
  })

  test('白名单外拒绝', () => {
    expect(isAllowedOrigin('https://evil.example.com', allowed)).toBe(false)
  })

  test('忽略端口差异拒绝（严格相等）', () => {
    expect(isAllowedOrigin('https://serenique.pages.dev:8443', allowed)).toBe(false)
  })
})
