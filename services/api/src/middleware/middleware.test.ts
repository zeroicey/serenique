import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { bodyLimit, csrf, rateLimit, secureHeaders, timeout } from '@/middleware'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// 安全中间件单测 —— 各自用独立 Hono 实例 + 显式参数，不依赖 @/env 的值
// （bun test 单进程共享 env，先 import 先赢，测试必须自给自足）：
//   - rateLimit: 窗口内超限 → 429 统一信封；/health 豁免
//   - csrf: 表单类请求按 Origin 白名单拦截；无 Origin（CLI/curl）放行；
//            JSON 请求由 CORS 预检负责（hono/csrf 设计如此），不受影响
//   - bodyLimit: 超限 → 413 统一信封
//   - timeout: 慢处理 → 超时（504 → 无 onError 时返回异常自带状态码）
//   - secureHeaders: 安全响应头存在且 CORP 为 cross-origin（blob 跨域预览）
// ---------------------------------------------------------------------------

setTestEnv()

describe('rate-limit middleware', () => {
  test('超过窗口上限返回 429 统一信封，窗口内前几次放行', async () => {
    const app = new Hono()
    app.use('*', rateLimit({ limit: 2, windowMs: 60_000, skip: () => false }))
    app.get('/', (c) => c.text('ok'))

    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(200)
    const blocked = await app.request('/')
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('RATE_LIMITED')
  })

  test('/health 豁免限流（模拟生产 skip 条件：仅 /health 豁免）', async () => {
    const app = new Hono()
    app.use(
      '*',
      rateLimit({
        limit: 1,
        windowMs: 60_000,
        skip: (c) => c.req.path === '/health',
      }),
    )
    app.get('/health', (c) => c.text('ok'))
    app.get('/other', (c) => c.text('ok'))

    // /health 不限流：Docker HEALTHCHECK / 监控每 30s 探活一次
    expect((await app.request('/health')).status).toBe(200)
    expect((await app.request('/health')).status).toBe(200)
    // 非豁免路径照常限流
    expect((await app.request('/other')).status).toBe(200)
    expect((await app.request('/other')).status).toBe(429)
  })
})

describe('csrf middleware', () => {
  const allowedOrigin = 'https://serenique.0icey.icu'
  const evilOrigin = 'https://evil.example.com'

  function makeApp() {
    const app = new Hono()
    app.use('*', csrf([allowedOrigin]))
    app.post('/upload', async (c) => {
      await c.req.parseBody().catch(() => ({}))
      return c.text('ok')
    })
    app.post('/json', (c) => c.text('ok'))
    app.get('/get', (c) => c.text('ok'))
    return app
  }

  test('白名单内 Origin 的表单请求放行', async () => {
    const app = makeApp()
    const res = await app.request('/upload', {
      method: 'POST',
      headers: {
        origin: allowedOrigin,
        'content-type': 'multipart/form-data; boundary=xxx',
      },
      body: '--xxx\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--xxx--\r\n',
    })
    expect(res.status).toBe(200)
  })

  test('白名单外 Origin 的表单请求 403（跨站表单伪造防护）', async () => {
    const app = makeApp()
    const res = await app.request('/upload', {
      method: 'POST',
      headers: {
        origin: evilOrigin,
        'content-type': 'multipart/form-data; boundary=xxx',
      },
      body: '--xxx\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--xxx--\r\n',
    })
    expect(res.status).toBe(403)
    // 统一响应信封（FORBIDDEN），不是被全局 onError 吞成 500
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('FORBIDDEN')
  })

  test('无 Origin 头（CLI/curl 等非浏览器客户端）放行', async () => {
    const app = makeApp()
    const res = await app.request('/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=xxx' },
      body: '--xxx\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--xxx--\r\n',
    })
    expect(res.status).toBe(200)
  })

  test('JSON 请求不受 CSRF 中间件影响（由 CORS 预检负责）', async () => {
    const app = makeApp()
    const res = await app.request('/json', {
      method: 'POST',
      headers: { origin: evilOrigin, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  test('GET（安全方法）不受 Origin 校验影响', async () => {
    const app = makeApp()
    const res = await app.request('/get', { headers: { origin: evilOrigin } })
    expect(res.status).toBe(200)
  })
})

describe('body-limit middleware', () => {
  test('超过上限返回 413 统一信封', async () => {
    const app = new Hono()
    app.use('*', bodyLimit(100))
    app.post('/', (c) => c.text('ok'))

    const small = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(50),
    })
    expect(small.status).toBe(200)

    const big = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(200),
    })
    expect(big.status).toBe(413)
    const body = await big.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('PAYLOAD_TOO_LARGE')
  })
})

describe('timeout middleware', () => {
  test('慢处理超时返回 504（未配置 onError 时返回异常自带状态）', async () => {
    const app = new Hono()
    app.use('*', timeout(10))
    app.get('/slow', async (c) => {
      await Bun.sleep(100)
      return c.text('too late')
    })

    const res = await app.request('/slow')
    expect(res.status).toBe(504)
  })

  test('/api/ai/* 豁免超时', async () => {
    const app = new Hono()
    app.use('*', timeout(10))
    app.get('/api/ai/ws', async (c) => {
      await Bun.sleep(100)
      return c.text('stream ok')
    })

    const res = await app.request('/api/ai/ws')
    expect(res.status).toBe(200)
  })
})

describe('secure-headers middleware', () => {
  test('设置安全响应头，CORP 为 cross-origin（blob 跨域预览需要）', async () => {
    const app = new Hono()
    app.use('*', secureHeaders())
    app.get('/', (c) => c.text('ok'))

    const res = await app.request('/')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(res.headers.get('strict-transport-security')).toBeTruthy()
    expect(res.headers.get('x-powered-by')).toBeNull()
  })
})
