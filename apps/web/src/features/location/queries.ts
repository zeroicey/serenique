import { useQuery } from '@tanstack/react-query'
import { fetchNearbyLocations, getLocationConfig, searchLocations } from './api'

// Location 数据 hooks。config 惰性缓存（创建页挂载时取一次）；nearby/search
// 由选点弹窗按 open 状态 + 坐标/关键字动态启用。

export function useLocationConfig() {
  return useQuery({
    queryKey: ['location-config'],
    queryFn: getLocationConfig,
    staleTime: 5 * 60 * 1000,
  })
}

export type LocationCoords = { lng: number; lat: number }

export function useNearbyLocations(coords: LocationCoords | null, enabled: boolean) {
  return useQuery({
    queryKey: ['location-nearby', coords?.lng, coords?.lat],
    queryFn: () => fetchNearbyLocations({ lng: coords!.lng, lat: coords!.lat, radius: 3000 }),
    enabled: enabled && coords !== null,
  })
}

export function useLocationSearch(
  keyword: string,
  coords: LocationCoords | null,
  enabled: boolean,
) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: ['location-search', trimmed, coords?.lng, coords?.lat],
    queryFn: () => searchLocations({ keyword: trimmed, ...(coords ?? {}) }),
    enabled: enabled && trimmed.length > 0,
  })
}
