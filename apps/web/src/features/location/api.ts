import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// Location 模块 API 契约：Web 端选点走服务端代理（高德 Web 服务 API），
// Key 只放服务端 env（AMAP_KEY）。客户端只透传浏览器定位坐标（WGS-84），
// 服务端负责转 GCJ-02；返回的 latitude/longitude 即为可直接存储/使用的值。

export interface LocationConfig {
  enabled: boolean
}

// 附近/搜索结果条目（后端返回形状，name + GCJ-02 坐标；distance 为米，仅 nearby 有）。
export interface LocationPoi {
  name: string
  latitude: number
  longitude: number
  address?: string
  distance?: number
}

interface LocationListResult {
  items: LocationPoi[]
}

export async function getLocationConfig(): Promise<LocationConfig> {
  const res = await api.get(apiUrl('location/config'))
  return unwrap<LocationConfig>(res)
}

export async function fetchNearbyLocations(params: {
  lng: number
  lat: number
  radius?: number
  keyword?: string
}): Promise<LocationPoi[]> {
  const searchParams: Record<string, string> = {
    lng: String(params.lng),
    lat: String(params.lat),
  }
  if (params.radius != null) searchParams.radius = String(params.radius)
  if (params.keyword) searchParams.keyword = params.keyword
  const res = await api.get(apiUrl('location/nearby'), { searchParams })
  const data = await unwrap<LocationListResult>(res)
  return data.items
}

export async function searchLocations(params: {
  keyword: string
  lng?: number
  lat?: number
}): Promise<LocationPoi[]> {
  const searchParams: Record<string, string> = { keyword: params.keyword }
  if (params.lng != null) searchParams.lng = String(params.lng)
  if (params.lat != null) searchParams.lat = String(params.lat)
  const res = await api.get(apiUrl('location/search'), { searchParams })
  const data = await unwrap<LocationListResult>(res)
  return data.items
}
