import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/helpers'
import { useMomentDraftStore } from '@/stores/moment-draft'
import * as queries from '@/features/moment/queries'
import MomentCreatePage from './moment-create-page'

vi.mock('@/features/moment/queries', () => ({
  useCreateMomentWithMedia: vi.fn(),
}))

// mutate 为 spy（不触发 onSuccess，避免导航卸载）；isPending 固定 false。
let mutate: ReturnType<typeof vi.fn>
beforeEach(() => {
  useMomentDraftStore.getState().clearDraft()
  mutate = vi.fn()
  vi.mocked(queries.useCreateMomentWithMedia).mockReturnValue({
    mutate,
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

  it('输入文本后发布携带正确参数', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '今天很开心')
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenCalledWith({ text: '今天很开心', files: [] }, expect.any(Object))
  })
})
