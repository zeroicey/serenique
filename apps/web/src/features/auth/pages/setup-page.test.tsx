import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import SetupPage from './setup-page'
import { useSetupRegister } from '../queries'

// mock 掉 setup mutation，页面只测：token 门控、创建流程、403/401/浏览器错误分支。
vi.mock('../queries', () => ({
  useSetupRegister: vi.fn(),
}))

const mockedUseSetupRegister = vi.mocked(useSetupRegister)
const setupMutateAsync = vi.fn()

function renderPage(setupToken: string | null) {
  const initialEntries = [setupToken === null ? '/setup' : `/setup?setupToken=${setupToken}`]
  mockedUseSetupRegister.mockReturnValue({
    mutateAsync: setupMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useSetupRegister>)
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<div>login-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SetupPage', () => {
  beforeEach(() => {
    setupMutateAsync.mockReset()
  })

  it('无 setupToken → 展示「设置链接无效」，无创建按钮', () => {
    renderPage(null)
    expect(screen.getByText('设置链接无效')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建通行密钥' })).not.toBeInTheDocument()
  })

  it('有 setupToken → 标题「创建通行密钥」+ 创建按钮', () => {
    renderPage('tok-123')
    // CardTitle 渲染为 div（data-slot=card-title），按钮文本与标题相同需按节点区分。
    expect(document.querySelector('[data-slot="card-title"]')).toHaveTextContent('创建通行密钥')
    expect(screen.getByRole('button', { name: '创建通行密钥' })).toBeInTheDocument()
  })

  it('点击创建 → 携带 setupToken 调用注册 mutation，成功后跳主页', async () => {
    const user = userEvent.setup()
    setupMutateAsync.mockResolvedValue({ authenticated: true, user: null })
    renderPage('tok-123')

    await user.click(screen.getByRole('button', { name: '创建通行密钥' }))

    expect(setupMutateAsync).toHaveBeenCalledWith({ setupToken: 'tok-123' })
    expect(await screen.findByText('home-marker')).toBeInTheDocument()
  })

  it('403（引导注册令牌不正确）→ 内联展示服务端文案', async () => {
    const user = userEvent.setup()
    setupMutateAsync.mockRejectedValue(new ApiError('引导注册令牌不正确', 403))
    renderPage('tok-wrong')

    await user.click(screen.getByRole('button', { name: '创建通行密钥' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('引导注册令牌不正确')
  })

  it('500（未建用户）→ 内联展示引导脚本提示', async () => {
    const user = userEvent.setup()
    setupMutateAsync.mockRejectedValue(
      new ApiError('未找到用户，请先运行引导脚本创建用户：bun scripts/bootstrap-user.ts', 500),
    )
    renderPage('tok-123')

    await user.click(screen.getByRole('button', { name: '创建通行密钥' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('bun scripts/bootstrap-user.ts')
  })

  it('401（已有凭证，引导期已过）→ 跳登录页，不展示错误', async () => {
    const user = userEvent.setup()
    setupMutateAsync.mockRejectedValue(new ApiError('请先登录后再添加新的登录凭证', 401))
    renderPage('tok-123')

    await user.click(screen.getByRole('button', { name: '创建通行密钥' }))

    expect(await screen.findByText('login-marker')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('浏览器错误（复用 webauthn 翻译文案）→ 内联展示', async () => {
    const user = userEvent.setup()
    setupMutateAsync.mockRejectedValue(new Error('已取消注册'))
    renderPage('tok-123')

    await user.click(screen.getByRole('button', { name: '创建通行密钥' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('已取消注册')
  })
})
