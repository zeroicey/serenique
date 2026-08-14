import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as locationApi from '@/features/location/api'
import { renderWithProviders } from '@/test/helpers'
import { MomentLocationPicker } from './moment-location-picker'

vi.mock('@/features/location/api', () => ({
  getLocationConfig: vi.fn(),
  fetchNearbyLocations: vi.fn(),
  searchLocations: vi.fn(),
}))

const mockedNearby = vi.mocked(locationApi.fetchNearbyLocations)
const mockedSearch = vi.mocked(locationApi.searchLocations)

function stubGeoSuccess(lat = 39.9087, lng = 116.3975) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition),
    },
  })
}

function stubGeoFail() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
        error({ code: 1, message: 'denied' } as GeolocationPositionError),
    },
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation')
})

beforeEach(() => {
  mockedNearby.mockReset()
  mockedSearch.mockReset()
  mockedNearby.mockResolvedValue([])
  mockedSearch.mockResolvedValue([])
})

function renderPicker(onSelect = vi.fn(), onOpenChange = vi.fn()) {
  return {
    onSelect,
    onOpenChange,
    ...renderWithProviders(
      <MomentLocationPicker open onOpenChange={onOpenChange} onSelect={onSelect} />,
    ),
  }
}

describe('MomentLocationPicker', () => {
  it('定位失败时提示可手动搜索，且不阻塞搜索框', async () => {
    stubGeoFail()
    renderPicker()
    expect(await screen.findByText('无法获取当前位置，可直接搜索')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索位置')).toBeInTheDocument()
  })

  it('定位成功后按距离显示附近列表（≥1000m 显示 km）', async () => {
    stubGeoSuccess()
    mockedNearby.mockResolvedValue([
      { name: '三里屯', latitude: 39.9087, longitude: 116.3975, distance: 800 },
      { name: '朝阳公园', latitude: 39.9337, longitude: 116.4748, distance: 3200 },
    ])
    renderPicker()

    expect(await screen.findByText('三里屯')).toBeInTheDocument()
    expect(screen.getByText('800 m')).toBeInTheDocument()
    expect(screen.getByText('朝阳公园')).toBeInTheDocument()
    expect(screen.getByText('3.2 km')).toBeInTheDocument()
    expect(mockedNearby).toHaveBeenCalledWith({
      lng: 116.3975,
      lat: 39.9087,
      radius: 3000,
    })
  })

  it('点击列表项以 GCJ-02 坐标回调并关闭弹窗', async () => {
    stubGeoSuccess()
    mockedNearby.mockResolvedValue([
      { name: '三里屯', latitude: 39.9087, longitude: 116.3975, distance: 800 },
    ])
    const { onSelect, onOpenChange } = renderPicker()

    await userEvent.click(await screen.findByRole('button', { name: /三里屯/ }))
    expect(onSelect).toHaveBeenCalledWith({
      name: '三里屯',
      latitude: 39.9087,
      longitude: 116.3975,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('搜索框防抖后调用 search（带定位坐标时附带 lng/lat）', async () => {
    stubGeoSuccess()
    mockedSearch.mockResolvedValue([{ name: '故宫', latitude: 39.9163, longitude: 116.3972 }])
    const { onSelect } = renderPicker()

    await userEvent.type(screen.getByPlaceholderText('搜索位置'), '故宫')
    expect(await screen.findByRole('button', { name: /故宫/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedSearch).toHaveBeenCalledWith({ keyword: '故宫', lng: 116.3975, lat: 39.9087 }),
    )
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('定位失败时搜索可不带坐标', async () => {
    stubGeoFail()
    mockedSearch.mockResolvedValue([{ name: '故宫', latitude: 39.9163, longitude: 116.3972 }])
    renderPicker()

    await userEvent.type(screen.getByPlaceholderText('搜索位置'), '故宫')
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledWith({ keyword: '故宫' }))
  })

  it('附近列表为空时显示空态', async () => {
    stubGeoSuccess()
    renderPicker()
    expect(await screen.findByText('附近暂无位置')).toBeInTheDocument()
  })
})
