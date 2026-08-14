import type { LocationItem } from '@/modules/location/location.types'

// ---------------------------------------------------------------------------
// Location mappers — AMAP Web 服务响应 → LocationItem[]（纯函数）。
//
// 高德返回的 location 字段是 GCJ-02 的 "lng,lat" 字符串，直接解析透传给
// 客户端，不做二次转换（决策 #5）。坐标缺失/非法（无 location 或不可解析）
// 的 POI/tip 直接跳过。
// ---------------------------------------------------------------------------

export type AmapBaseResponse = {
  status?: string
  info?: string
  infocode?: string
}

export type AmapAroundPoi = {
  name?: string
  location?: string
  address?: string
  distance?: string
}

export type AmapAroundResponse = AmapBaseResponse & { pois?: AmapAroundPoi[] }

export type AmapTip = {
  name?: string
  location?: string
  address?: string
}

export type AmapInputtipsResponse = AmapBaseResponse & { tips?: AmapTip[] }

/** 解析高德 "lng,lat" 坐标字符串；缺失或非法返回 null。 */
export function parseAmapLocation(
  location: string | undefined,
): { lng: number; lat: number } | null {
  if (!location) return null
  const [lngStr, latStr] = location.split(',')
  const lng = Number(lngStr)
  const lat = Number(latStr)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

function toItem(
  name: string | undefined,
  coord: { lng: number; lat: number },
  address?: string,
  distance?: string,
): LocationItem {
  const item: LocationItem = {
    name: name ?? '',
    latitude: coord.lat,
    longitude: coord.lng,
  }
  if (address) item.address = address
  const d = Number(distance)
  if (Number.isFinite(d)) item.distance = d
  return item
}

/** place/around 响应：pois[] → items（distance 转 number）。 */
export function mapAroundResponse(body: AmapAroundResponse): LocationItem[] {
  const items: LocationItem[] = []
  for (const poi of body.pois ?? []) {
    const coord = parseAmapLocation(poi.location)
    if (!coord) continue
    items.push(toItem(poi.name, coord, poi.address, poi.distance))
  }
  return items
}

/** inputtips 响应：tips[] → items。 */
export function mapInputtipsResponse(body: AmapInputtipsResponse): LocationItem[] {
  const items: LocationItem[] = []
  for (const tip of body.tips ?? []) {
    const coord = parseAmapLocation(tip.location)
    if (!coord) continue
    items.push(toItem(tip.name, coord, tip.address))
  }
  return items
}
