import { Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { LocationPoi } from '@/features/location/api'
// 跨 feature 数据 hook：选点搜索属 location 域，moment 消费其数据是刻意豁免（规则 5）。
import { useLocationSearch, useNearbyLocations } from '@/features/location/queries'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { MomentLocation } from '@/lib/location'
import { formatDistance } from '@/lib/location'

interface MomentLocationPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (location: MomentLocation) => void
}

const GEO_TIMEOUT_MS = 8000

// 朋友圈式选点弹窗：打开时浏览器定位 → 附近列表；顶部搜索框防抖搜索；
// 定位失败不阻塞（提示后仍可手动搜索）。坐标直接透传后端返回的 GCJ-02 值。
export function MomentLocationPicker({ open, onOpenChange, onSelect }: MomentLocationPickerProps) {
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null)
  const [geoFailed, setGeoFailed] = useState(false)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword, 300)
  const searching = debouncedKeyword.trim().length > 0

  useEffect(() => {
    if (!open) return
    setCoords(null)
    setGeoFailed(false)
    setKeyword('')
    if (!('geolocation' in navigator)) {
      setGeoFailed(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => setGeoFailed(true),
      { timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    )
  }, [open])

  const nearbyQuery = useNearbyLocations(coords, open && !searching)
  const searchQuery = useLocationSearch(debouncedKeyword, coords, open && searching)

  const items = searching ? (searchQuery.data ?? []) : (nearbyQuery.data ?? [])
  const isLoading = searching ? searchQuery.isPending : nearbyQuery.isPending

  const pick = (item: LocationPoi) => {
    onSelect({ name: item.name, latitude: item.latitude, longitude: item.longitude })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择位置</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜索位置"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          {geoFailed && !searching && (
            <p className="text-xs text-muted-foreground">无法获取当前位置，可直接搜索</p>
          )}

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {searching ? '未找到相关位置' : '附近暂无位置'}
            </p>
          ) : (
            <ul className="max-h-[300px] overflow-auto">
              {items.map((item, _i) => (
                <li key={`${item.name}-${item.latitude}-${item.longitude}`}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
                    onClick={() => pick(item)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.name}</span>
                      {item.distance != null && (
                        <span className="block text-xs text-muted-foreground">
                          {formatDistance(item.distance)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
