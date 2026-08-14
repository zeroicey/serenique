import { afterAll, describe, expect, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Location service unit tests — Zod query schemas, AMAP response mappers and
// the 10-minute cache (fetch stubbed via globalThis.fetch, AMAP_KEY injected
// via process.env). No network, no DB. 各测试用不同坐标，避免共享模块级缓存
// 互相污染。
// ---------------------------------------------------------------------------

setTestEnv()

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_AMAP_KEY = process.env.AMAP_KEY

afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH
  if (ORIGINAL_AMAP_KEY === undefined) delete process.env.AMAP_KEY
  else process.env.AMAP_KEY = ORIGINAL_AMAP_KEY
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** 替换 globalThis.fetch，记录每次调用 URL，按 handler 生成响应。 */
function installFetchMock(handler: (url: string) => Response): string[] {
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    return handler(url)
  }) as typeof fetch
  return calls
}

describe('locationService.config', () => {
  test('AMAP_KEY 未配置 → enabled=false', async () => {
    delete process.env.AMAP_KEY
    const { locationService } = await import('./location.service')
    expect(locationService.config()).toEqual({ enabled: false })
  })

  test('AMAP_KEY 已配置 → enabled=true', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const { locationService } = await import('./location.service')
    expect(locationService.config()).toEqual({ enabled: true })
  })
})

describe('locationService 未配置 AMAP_KEY → 503', () => {
  test('nearby / search 抛出 SERVICE_UNAVAILABLE AppError', async () => {
    delete process.env.AMAP_KEY
    const { locationService } = await import('./location.service')

    for (const call of [
      () => locationService.nearby({ lng: 116.4, lat: 39.9 }),
      () => locationService.search({ keyword: '咖啡' }),
    ]) {
      let threw = false
      try {
        await call()
      } catch (e) {
        threw = true
        expect((e as { status?: number }).status).toBe(503)
        expect((e as { code?: string }).code).toBe('SERVICE_UNAVAILABLE')
        expect((e as Error).message).toBe('位置服务未配置')
      }
      expect(threw).toBe(true)
    }
  })
})

describe('nearby — WGS-84 转 GCJ-02 后调 place/around', () => {
  test('请求参数（key/radius/sortrule/GCJ-02 location）与响应映射正确', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() =>
      jsonResponse({
        status: '1',
        info: 'OK',
        pois: [
          {
            name: '天安门',
            location: '116.397428,39.90923',
            address: '东城区东长安街',
            distance: '150',
          },
          { name: '无坐标POI', location: '' },
          { name: '前门', location: '116.399,39.899', distance: 'not-a-number' },
        ],
      }),
    )

    const { locationService } = await import('./location.service')
    const result = await locationService.nearby({ lng: 116.391275, lat: 39.906217 })

    expect(calls).toHaveLength(1)
    const url = calls[0]
    expect(url).toContain('/v3/place/around?')
    expect(url).toContain('key=test-amap-key')
    expect(url).toContain('radius=3000')
    expect(url).toContain('sortrule=distance')
    // 设备 WGS-84 已被服务端转换为 GCJ-02（天安门测试点）
    expect(url).toMatch(/location=116\.3975\d*%2C39\.9076\d*/)

    expect(result.items).toEqual([
      {
        name: '天安门',
        latitude: 39.90923,
        longitude: 116.397428,
        address: '东城区东长安街',
        distance: 150,
      },
      { name: '前门', latitude: 39.899, longitude: 116.399 },
    ])
  })

  test('带 keyword 时透传给 keywords 参数', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() => jsonResponse({ status: '1', pois: [] }))

    const { locationService } = await import('./location.service')
    await locationService.nearby({ lng: 116.4, lat: 39.9, radius: 1000, keyword: '咖啡' })

    expect(calls).toHaveLength(1)
    expect(decodeURIComponent(calls[0])).toContain('keywords=咖啡')
  })
})

describe('search — inputtips 代理', () => {
  test('调用 inputtips（datatype=poi），映射 tips → items', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() =>
      jsonResponse({
        status: '1',
        info: 'OK',
        tips: [
          { name: '天安门', location: '116.397428,39.90923', address: '东城区' },
          { name: '无坐标tip' },
        ],
      }),
    )

    const { locationService } = await import('./location.service')
    const result = await locationService.search({ keyword: '天安门' })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/v3/assistant/inputtips?')
    expect(calls[0]).toContain('datatype=poi')
    expect(decodeURIComponent(calls[0])).toContain('keywords=天安门')
    expect(calls[0]).not.toContain('location=')
    expect(result.items).toEqual([
      { name: '天安门', latitude: 39.90923, longitude: 116.397428, address: '东城区' },
    ])
  })

  test('带 lng/lat 时转 GCJ-02 并附带 location 参数（就近优先）', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() => jsonResponse({ status: '1', tips: [] }))

    const { locationService } = await import('./location.service')
    await locationService.search({ keyword: '咖啡', lng: 116.391275, lat: 39.906217 })

    expect(calls[0]).toMatch(/location=116\.3975\d*%2C39\.9076\d*/)
  })
})

describe('缓存 — 10 分钟 LRU', () => {
  test('相同参数二次调用命中缓存，不重复请求高德', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() =>
      jsonResponse({
        status: '1',
        pois: [{ name: '天安门', location: '116.397428,39.90923' }],
      }),
    )

    const { locationService } = await import('./location.service')
    const input = { lng: 113.9, lat: 22.5 } // 深圳（与其它用例坐标不同，避免共享缓存冲突）
    const first = await locationService.nearby(input)
    const second = await locationService.nearby(input)

    expect(calls).toHaveLength(1)
    expect(second).toEqual(first)
    expect(second.items).toEqual([{ name: '天安门', latitude: 39.90923, longitude: 116.397428 }])
  })

  test('高德业务错误（status!=1）被缓存：重复调用不再请求', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() =>
      jsonResponse({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' }),
    )

    const { locationService } = await import('./location.service')
    const input = { lng: 121.47, lat: 31.23 } // 上海（与前例坐标不同，避免缓存冲突）

    for (let i = 0; i < 2; i++) {
      let threw = false
      try {
        await locationService.nearby(input)
      } catch (e) {
        threw = true
        expect((e as Error).message).toBe('位置服务返回异常，请稍后重试')
      }
      expect(threw).toBe(true)
    }
    expect(calls).toHaveLength(1)
  })

  test('网络失败不缓存：每次调用都重试请求', async () => {
    process.env.AMAP_KEY = 'test-amap-key'
    const calls = installFetchMock(() => {
      throw new TypeError('fetch failed')
    })

    const { locationService } = await import('./location.service')
    const input = { lng: 113.26, lat: 23.13 } // 广州

    for (let i = 0; i < 2; i++) {
      let threw = false
      try {
        await locationService.nearby(input)
      } catch (e) {
        threw = true
        expect((e as Error).message).toBe('位置服务暂不可用，请稍后重试')
      }
      expect(threw).toBe(true)
    }
    expect(calls).toHaveLength(2)
  })
})

describe('location zod schemas', () => {
  test('NearbyQuerySchema：coerce 字符串、radius 默认 3000、keyword trim', async () => {
    const { NearbyQuerySchema } = await import('./location.types')
    const parsed = NearbyQuerySchema.parse({ lng: '116.4', lat: '39.9' })
    expect(parsed).toEqual({ lng: 116.4, lat: 39.9, radius: 3000 })

    const withAll = NearbyQuerySchema.parse({
      lng: '116.4',
      lat: '39.9',
      radius: '500',
      keyword: ' 咖啡 ',
    })
    expect(withAll.radius).toBe(500)
    expect(withAll.keyword).toBe('咖啡')
  })

  test('NearbyQuerySchema：拒绝越界坐标、非法 radius 与缺参', async () => {
    const { NearbyQuerySchema } = await import('./location.types')
    expect(NearbyQuerySchema.safeParse({ lng: 181, lat: 0 }).success).toBe(false)
    expect(NearbyQuerySchema.safeParse({ lng: 0, lat: 91 }).success).toBe(false)
    expect(NearbyQuerySchema.safeParse({ lng: 0, lat: 0, radius: 0 }).success).toBe(false)
    expect(NearbyQuerySchema.safeParse({ lng: 0, lat: 0, radius: 50001 }).success).toBe(false)
    expect(NearbyQuerySchema.safeParse({ lng: 'abc', lat: 0 }).success).toBe(false)
    expect(NearbyQuerySchema.safeParse({ lat: 0 }).success).toBe(false) // 缺 lng
  })

  test('NearbyQuerySchema：keyword 上限 50 字', async () => {
    const { NearbyQuerySchema } = await import('./location.types')
    expect(NearbyQuerySchema.safeParse({ lng: 0, lat: 0, keyword: 'x'.repeat(51) }).success).toBe(
      false,
    )
    expect(NearbyQuerySchema.safeParse({ lng: 0, lat: 0, keyword: 'x'.repeat(50) }).success).toBe(
      true,
    )
  })

  test('SearchQuerySchema：keyword 必填（1..50），lng/lat 成对出现', async () => {
    const { SearchQuerySchema } = await import('./location.types')
    expect(SearchQuerySchema.safeParse({}).success).toBe(false)
    expect(SearchQuerySchema.safeParse({ keyword: ' ' }).success).toBe(false)
    expect(SearchQuerySchema.safeParse({ keyword: 'x'.repeat(51) }).success).toBe(false)
    expect(SearchQuerySchema.safeParse({ keyword: '咖啡' }).success).toBe(true)
    expect(
      SearchQuerySchema.safeParse({ keyword: '咖啡', lng: '116.4', lat: '39.9' }).success,
    ).toBe(true)
    expect(SearchQuerySchema.safeParse({ keyword: '咖啡', lng: '116.4' }).success).toBe(false)
  })
})

describe('location mappers — 高德响应 → items', () => {
  test('mapAroundResponse：name/坐标/address/distance 映射', async () => {
    const { mapAroundResponse } = await import('./location.mappers')
    const items = mapAroundResponse({
      status: '1',
      pois: [
        {
          name: '天安门',
          location: '116.397428,39.90923',
          address: '东城区东长安街',
          distance: '150',
        },
      ],
    })
    expect(items).toEqual([
      {
        name: '天安门',
        latitude: 39.90923,
        longitude: 116.397428,
        address: '东城区东长安街',
        distance: 150,
      },
    ])
  })

  test('mapAroundResponse / parseAmapLocation：跳过无坐标或非法坐标', async () => {
    const { mapAroundResponse, parseAmapLocation } = await import('./location.mappers')
    expect(parseAmapLocation(undefined)).toBeNull()
    expect(parseAmapLocation('not-a-coord')).toBeNull()
    expect(parseAmapLocation('116.4,39.9')).toEqual({ lng: 116.4, lat: 39.9 })

    const items = mapAroundResponse({
      status: '1',
      pois: [
        { name: '有坐标', location: '116.4,39.9' },
        { name: '无坐标' },
        { name: '非法坐标', location: 'abc' },
      ],
    })
    expect(items).toEqual([{ name: '有坐标', latitude: 39.9, longitude: 116.4 }])
  })

  test('mapInputtipsResponse：映射 tips，跳过无坐标条目', async () => {
    const { mapInputtipsResponse } = await import('./location.mappers')
    const items = mapInputtipsResponse({
      status: '1',
      tips: [
        { name: '天安门', location: '116.397428,39.90923', address: '东城区' },
        { name: '无坐标' },
      ],
    })
    expect(items).toEqual([
      { name: '天安门', latitude: 39.90923, longitude: 116.397428, address: '东城区' },
    ])
    expect(mapInputtipsResponse({ status: '1' })).toEqual([])
  })
})
