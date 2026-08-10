import { describe, expect, it } from 'vitest'
import { formatDistance, formatLocationLabel, locationAmapUrl } from './format'

describe('formatLocationLabel', () => {
  it('name 优先', () => {
    expect(
      formatLocationLabel({ name: '北京·三里屯', latitude: 39.9087, longitude: 116.3975 }),
    ).toBe('北京·三里屯')
  })

  it('无 name 时显示坐标文本（lat, lng，4 位小数）', () => {
    expect(formatLocationLabel({ latitude: 39.90872, longitude: 116.39751 })).toBe(
      '39.9087, 116.3975',
    )
  })

  it('仅单坐标时兜底为未知位置', () => {
    expect(formatLocationLabel({ latitude: 39.9 })).toBe('未知位置')
  })
})

describe('locationAmapUrl', () => {
  it('生成高德深链（position 为 经度,纬度 顺序）', () => {
    expect(locationAmapUrl({ name: '三里屯', latitude: 39.9087, longitude: 116.3975 })).toBe(
      'https://uri.amap.com/marker?position=116.3975,39.9087&name=%E4%B8%89%E9%87%8C%E5%B1%AF&callnative=1',
    )
  })

  it('无坐标（仅 name）返回 null', () => {
    expect(locationAmapUrl({ name: '某地' })).toBeNull()
  })
})

describe('formatDistance', () => {
  it('≥1000 米显示 km（保留 1 位小数）', () => {
    expect(formatDistance(3200)).toBe('3.2 km')
    expect(formatDistance(1000)).toBe('1.0 km')
  })

  it('不足 1000 米显示整米', () => {
    expect(formatDistance(800)).toBe('800 m')
    expect(formatDistance(5)).toBe('5 m')
  })
})
