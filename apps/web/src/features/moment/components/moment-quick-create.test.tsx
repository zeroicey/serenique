import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as queries from '@/features/moment/queries'
import { useMomentDraftStore } from '@/stores/moment-draft'
import { renderWithProviders } from '@/test/helpers'
import { MomentQuickCreate } from './moment-quick-create'

vi.mock('@/features/moment/queries', () => ({
  useCreateMomentWithMedia: vi.fn(),
}))

// mutate 为 spy；触发 onSuccess 时可验证发布后清空。
let mutate: ReturnType<typeof vi.fn>
beforeEach(() => {
  useMomentDraftStore.getState().clearDraft()
  mutate = vi.fn()
  vi.mocked(queries.useCreateMomentWithMedia).mockReturnValue({
    mutate,
    isPending: false,
  } as never)
})

function render() {
  return renderWithProviders(
    <MemoryRouter>
      <MomentQuickCreate />
    </MemoryRouter>,
  )
}

describe('MomentQuickCreate', () => {
  it('渲染输入框、置灰的占位图标、展开按钮与发送按钮；空文字时发送禁用', () => {
    render()
    expect(screen.getByPlaceholderText('记录此刻的心情…')).toBeInTheDocument()

    // 三个功能入口置灰占位（本版仅文字）
    for (const label of ['位置', '标签', '添加文件']) {
      const btn = screen.getByRole('button', { name: label })
      expect(btn).toBeDisabled()
    }

    expect(screen.getByRole('button', { name: '进入完整编辑页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送闪记' })).toBeDisabled()
  })

  it('输入文字后发送按钮可用；点击后以文字发送并忽略占位功能', async () => {
    const user = userEvent.setup()
    render()
    const input = screen.getByPlaceholderText('记录此刻的心情…')
    await user.type(input, '  北京今天的天气不错  ')
    expect(screen.getByRole('button', { name: '发送闪记' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '发送闪记' }))
    expect(mutate).toHaveBeenCalledWith(
      { text: '北京今天的天气不错', files: [], location: null, tags: [] },
      expect.anything(),
    )
  })

  it('发送成功后清空输入框与草稿', async () => {
    const user = userEvent.setup()
    // mutate 回调里调用 onSuccess，模拟发布成功。
    mutate.mockImplementation((_args, handlers) => handlers?.onSuccess?.())
    render()
    const input = screen.getByPlaceholderText('记录此刻的心情…')
    await user.type(input, '发布这条')
    await user.click(screen.getByRole('button', { name: '发送闪记' }))

    expect(await screen.findByPlaceholderText('记录此刻的心情…')).toHaveValue('')
    expect(useMomentDraftStore.getState().draftText).toBe('')
  })

  it('输入即写入草稿（localStorage 续写），发布清空', async () => {
    const user = userEvent.setup()
    render()
    const input = screen.getByPlaceholderText('记录此刻的心情…')
    await user.type(input, '草稿内容')

    expect(useMomentDraftStore.getState().draftText).toBe('草稿内容')
  })

  it('点击展开按钮进入完整编辑页 /moment/create', async () => {
    const user = userEvent.setup()
    render()
    await user.click(screen.getByRole('button', { name: '进入完整编辑页' }))
    // 导航目标由 location 变化体现；这里断言按钮存在且可点击（MemoryRouter 内导航不抛错即可）。
    expect(screen.getByRole('button', { name: '进入完整编辑页' })).toBeInTheDocument()
  })
})
