import { nearbyCacheKey, searchCacheKey, wgs84ToGcj02 } from '@/modules/location/location.domain'
import {
  type AmapAroundResponse,
  type AmapBaseResponse,
  type AmapInputtipsResponse,
  mapAroundResponse,
  mapInputtipsResponse,
} from '@/modules/location/location.mappers'
import type {
  LocationConfigEntry,
  LocationItem,
  LocationQueryResult,
  NearbyServiceInput,
  SearchInput,
} from '@/modules/location/location.types'
import { AppError, ErrorCode } from '@/shared/errors'
import { logger } from '@/shared/logger'

// ---------------------------------------------------------------------------
// Location service — proxy for the AMAP Web Service API (高德 Web 服务).
//
//   GET /api/location/config   → { enabled }（AMAP_KEY 未配置 → false）
//   GET /api/location/nearby   → place/around（设备 WGS-84 转 GCJ-02 后查询）
//   GET /api/location/search   → assistant/inputtips（keyword 搜索）
//
// AMAP_KEY 直接读 process.env 而非 @/env 的解析快照：可选运行期配置，快照在
// 模块首次 import 时冻结（bun test 单进程共享缓存），直接读 env 让单测可注入、
// config 也能反映运行期变更。env.ts 中的声明仅做类型校验与文档化。
//
// 缓存：10 分钟（按请求参数序列化 key）。成功结果与高德业务错误（status!=1）
// 都缓存以压低配额消耗；网络失败（超时/连接错误）不缓存，下次调用重试。
// ---------------------------------------------------------------------------

const AMAP_BASE_URL = 'https://restapi.amap.com'
const AMAP_TIMEOUT_MS = 5000
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟
const CACHE_MAX_ENTRIES = 200
const NEARBY_OFFSET = 20
const NEARBY_DEFAULT_RADIUS = 3000

type CacheValue = { kind: 'ok'; items: LocationItem[] } | { kind: 'error'; error: AppError }

type CacheEntry = { expiresAt: number; value: CacheValue }

const cache = new Map<string, CacheEntry>()

function getAmapKey(): string | undefined {
  return process.env.AMAP_KEY
}

function cacheGet(key: string): CacheValue | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function cacheSet(key: string, value: CacheValue): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [k, e] of cache) {
      if (e.expiresAt < oldestAt) {
        oldestAt = e.expiresAt
        oldestKey = k
      }
    }
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
}

function resolveCached(value: CacheValue): LocationQueryResult {
  if (value.kind === 'error') throw value.error
  return { items: value.items }
}

/** 网络层请求。超时/连接失败/非 2xx/非法 JSON → AppError（不缓存）。 */
async function fetchAmapBody(path: string): Promise<AmapBaseResponse> {
  let res: Response
  try {
    res = await fetch(`${AMAP_BASE_URL}${path}`, {
      signal: AbortSignal.timeout(AMAP_TIMEOUT_MS),
    })
  } catch (e) {
    logger.warn({ err: e, path }, '高德位置服务请求失败')
    throw new AppError(ErrorCode.INTERNAL, '位置服务暂不可用，请稍后重试', 500)
  }
  if (!res.ok) {
    logger.warn({ status: res.status, path }, '高德位置服务返回非 2xx')
    throw new AppError(ErrorCode.INTERNAL, '位置服务暂不可用，请稍后重试', 500)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    logger.warn({ err: e, path }, '高德位置服务返回非法 JSON')
    throw new AppError(ErrorCode.INTERNAL, '位置服务返回异常，请稍后重试', 500)
  }
  return body as AmapBaseResponse
}

/** 高德 status !== "1" → 业务错误（缓存此结果，避免重复消耗配额）。 */
function amapErrorOrNull(body: AmapBaseResponse): AppError | null {
  if (body.status !== '1') {
    logger.warn(
      { status: body.status, info: body.info, infocode: body.infocode },
      '高德位置服务返回错误',
    )
    return new AppError(ErrorCode.INTERNAL, '位置服务返回异常，请稍后重试', 500)
  }
  return null
}

export const locationService = {
  config(): LocationConfigEntry {
    return { enabled: getAmapKey() !== undefined }
  },

  async nearby(input: NearbyServiceInput): Promise<LocationQueryResult> {
    const key = getAmapKey()
    if (!key) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '位置服务未配置', 503)
    }

    // handler 经 schema 解析后 radius 必含；直接调用方省略时回退默认值
    const radius = input.radius ?? NEARBY_DEFAULT_RADIUS
    const cacheKey = nearbyCacheKey({
      lng: input.lng,
      lat: input.lat,
      radius,
      keyword: input.keyword,
    })
    const cached = cacheGet(cacheKey)
    if (cached) return resolveCached(cached)

    // 设备 WGS-84 → 高德 GCJ-02（决策 #5：统一坐标系）
    const gcj = wgs84ToGcj02(input.lng, input.lat)
    const params = new URLSearchParams({
      key,
      location: `${gcj.lng},${gcj.lat}`,
      radius: String(radius),
      sortrule: 'distance',
      offset: String(NEARBY_OFFSET),
      page: '1',
    })
    if (input.keyword) params.set('keywords', input.keyword)

    const body = await fetchAmapBody(`/v3/place/around?${params.toString()}`)
    const error = amapErrorOrNull(body)
    if (error) {
      cacheSet(cacheKey, { kind: 'error', error })
      throw error
    }
    const items = mapAroundResponse(body as AmapAroundResponse)
    cacheSet(cacheKey, { kind: 'ok', items })
    return { items }
  },

  async search(input: SearchInput): Promise<LocationQueryResult> {
    const key = getAmapKey()
    if (!key) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '位置服务未配置', 503)
    }

    const cacheKey = searchCacheKey(input)
    const cached = cacheGet(cacheKey)
    if (cached) return resolveCached(cached)

    const params = new URLSearchParams({
      key,
      keywords: input.keyword,
      datatype: 'poi',
    })
    if (input.lng !== undefined && input.lat !== undefined) {
      const gcj = wgs84ToGcj02(input.lng, input.lat)
      params.set('location', `${gcj.lng},${gcj.lat}`)
    }

    const body = await fetchAmapBody(`/v3/assistant/inputtips?${params.toString()}`)
    const error = amapErrorOrNull(body)
    if (error) {
      cacheSet(cacheKey, { kind: 'error', error })
      throw error
    }
    const items = mapInputtipsResponse(body as AmapInputtipsResponse)
    cacheSet(cacheKey, { kind: 'ok', items })
    return { items }
  },
}
