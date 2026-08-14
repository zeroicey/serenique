// ---------------------------------------------------------------------------
// Location domain — pure computation for the AMAP proxy module. No DB / IO
// imports, so these are unit-testable without any network.
//
// Coordinate conversion: WGS-84 → GCJ-02 (火星坐标), the public algorithm from
// the coordtransform library. GCJ-02 is the coordinate system used by AMAP
// (and all Chinese map providers); device GPS delivers WGS-84, so the service
// converts before calling AMAP. See .ai/requirements/2026-08-08-moment-location.md
// 决策 #5. AMAP responses are already GCJ-02 and are passed through unchanged.
// ---------------------------------------------------------------------------

const PI = Math.PI
const A = 6378245.0 // GCJ-02 椭球长半轴
// JS number 只能表示到这个精度（0.00669342162296594323 的尾数超出 double 范围，
// 运行时会被舍入成下面这个值）——直接写可表示值，行为一致且避免精度告警。
const EE = 0.006693421622965943 // 偏心率平方

/** 判断坐标是否在中国境外（境外无火星偏移，原样返回）。 */
export function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return ret
}

export type Gcj02Coord = { lng: number; lat: number }

/** WGS-84 → GCJ-02；境外坐标不做偏移，原样返回。 */
export function wgs84ToGcj02(lng: number, lat: number): Gcj02Coord {
  if (outOfChina(lng, lat)) {
    return { lng, lat }
  }
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lng: lng + dLng, lat: lat + dLat }
}

// ---- Cache keys（按请求参数序列化，供 service 层 10 分钟缓存使用）----------

export function nearbyCacheKey(p: {
  lng: number
  lat: number
  radius: number
  keyword?: string
}): string {
  return `nearby:${p.lng}:${p.lat}:${p.radius}:${p.keyword ?? ''}`
}

export function searchCacheKey(p: { keyword: string; lng?: number; lat?: number }): string {
  return `search:${p.keyword}:${p.lng ?? ''}:${p.lat ?? ''}`
}
