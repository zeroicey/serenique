import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as locationQueries from '@/features/location/queries'
import * as queries from '@/features/moment/queries'
import { useMomentDraftStore } from '@/stores/moment-draft'
import { renderWithProviders } from '@/test/helpers'
import MomentCreatePage from './moment-create-page'

vi.mock('@/features/moment/queries', () => ({
  useCreateMomentWithMedia: vi.fn(),
}))

vi.mock('@/features/location/queries', () => ({
  useLocationConfig: vi.fn(),
  useNearbyLocations: vi.fn(),
  useLocationSearch: vi.fn(),
}))

vi.mock('@/features/tag/queries', () => ({
  useTags: vi.fn(),
}))

import * as tagQueries from '@/features/tag/queries'

// mutate 为 spy（不触发 onSuccess，避免导航卸载）；isPending 固定 false。
let mutate: ReturnType<typeof vi.fn>
beforeEach(() => {
  useMomentDraftStore.getState().clearDraft()
  mutate = vi.fn()
  vi.mocked(queries.useCreateMomentWithMedia).mockReturnValue({
    mutate,
    isPending: false,
  } as never)
  // 默认启用位置功能；弹窗内附近/搜索列表为空。
  vi.mocked(locationQueries.useLocationConfig).mockReturnValue({
    data: { enabled: true },
  } as never)
  vi.mocked(locationQueries.useNearbyLocations).mockReturnValue({
    data: [],
    isPending: false,
  } as never)
  vi.mocked(locationQueries.useLocationSearch).mockReturnValue({
    data: [],
    isPending: false,
  } as never)
  vi.mocked(tagQueries.useTags).mockReturnValue({
    data: [{ id: 't1', name: '工作', momentCount: 1 }],
    isPending: false,
  } as never)
})

describe('MomentCreatePage', () => {
  it('空文本不触发发布', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '   ')
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('输入文本后发布携带正确参数（location 为空）', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '今天很开心')
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenCalledWith(
      { text: '今天很开心', files: [], location: null, tags: [] },
      expect.any(Object),
    )
  })

  it('选择标签后发布内联 tags 携带所选 id', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '带标签的闪记')

    await user.click(screen.getByRole('button', { name: '添加标签' }))
    // 只选已有标签，列表中出现 #工作；点选后成为已选（可能同时出现在行触发与挑选面板 chip）
    await user.click(screen.getByText('#工作'))
    expect(screen.getAllByText('#工作').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenCalledWith(
      { text: '带标签的闪记', files: [], location: null, tags: ['t1'] },
      expect.any(Object),
    )
  })

  it('后端未启用位置时隐藏选点入口', () => {
    vi.mocked(locationQueries.useLocationConfig).mockReturnValue({
      data: { enabled: false },
    } as never)
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('所在位置')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '不显示位置' })).not.toBeInTheDocument()
  })

  it('选择位置后发布携带 location，可清除', async () => {
    const user = userEvent.setup()
    vi.mocked(locationQueries.useNearbyLocations).mockReturnValue({
      data: [{ name: '三里屯', latitude: 39.9087, longitude: 116.3975, distance: 800 }],
      isPending: false,
    } as never)
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '今天很开心')

    // 打开选点弹窗 → 从附近列表选中
    await user.click(screen.getByRole('button', { name: '不显示位置' }))
    await user.click(screen.getByRole('button', { name: /三里屯/ }))
    expect(screen.getByRole('button', { name: '三里屯' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '不显示位置' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenCalledWith(
      {
        text: '今天很开心',
        files: [],
        location: { name: '三里屯', latitude: 39.9087, longitude: 116.3975 },
        tags: [],
      },
      expect.any(Object),
    )

    // 清除位置后发布不带 location
    await user.click(screen.getByRole('button', { name: '清除位置' }))
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenLastCalledWith(
      { text: '今天很开心', files: [], location: null, tags: [] },
      expect.any(Object),
    )
  })

  it('取消后草稿保留（localStorage 持久化，误触不丢）', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '写到一半的内容')
    expect(useMomentDraftStore.getState().draftText).toBe('写到一半的内容')

    await user.click(screen.getByRole('button', { name: '取消' }))
    // 取消不清草稿：误触取消后重进页面仍能恢复
    expect(useMomentDraftStore.getState().draftText).toBe('写到一半的内容')
  })

  it('发布成功后清除草稿（onSuccess 回调）', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '即将发布的内容')
    expect(useMomentDraftStore.getState().draftText).toBe('即将发布的内容')

    // 点击发布触发 mutate；spy 不自动执行 onSuccess，手动触发验证草稿清除
    await user.click(screen.getByRole('button', { name: '发布' }))
    const options = mutate.mock.calls[0]?.[1] as { onSuccess?: () => void }
    options.onSuccess?.()
    expect(useMomentDraftStore.getState().draftText).toBe('')
  })
})
