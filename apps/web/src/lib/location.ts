// 跨 feature 共享的位置类型与纯函数（规则 5：features 之间不互引业务代码）。
// Moment 位置字段与位置展示/深链规则归此处，moment 与 location 两个 feature
// 都只消费本模块；数据查询 hook（features/location/queries）仍留在 location feature。

/** Moment 附件的位置信息（moment 模块契约字段：name + GCJ-02 坐标）。 */
export interface MomentLocation {
  name?: string
  latitude?: number
  longitude?: number
}

/** 位置展示/深链纯函数：列表卡片与创建页共用同一套显示规则。 */
export function formatLocationLabel(loc: MomentLocation): string {
  if (loc.name) return loc.name
  if (loc.latitude != null && loc.longitude != null) {
    return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`
  }
  return '未知位置'
}

// 高德深链（免 key，position 为 经度,纬度；GCJ-02 直接可用）。
// 无坐标（如只存了 name）时返回 null，由调用方决定不渲染链接。
export function locationAmapUrl(loc: MomentLocation): string | null {
  if (loc.latitude == null || loc.longitude == null) return null
  return `https://uri.amap.com/marker?position=${loc.longitude},${loc.latitude}&name=${encodeURIComponent(loc.name ?? '')}&callnative=1`
}

// 距离展示：≥1000m 显示 km（保留 1 位小数），否则显示整米。
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}
