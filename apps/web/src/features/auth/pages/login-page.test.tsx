import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import LoginPage from './login-page'
import { browserSupportsWebAuthn, loginWithPasskey } from '../webauthn'

// 不 mock queries —— 页面走真实 useLogin（onError toast 就是错误文案的呈现路径）；
// 只 mock webauthn 层（浏览器能力探测 + ceremony 编排，后者在 webauthn.test 里单测）。
vi.mock('../webauthn', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  loginWithPasskey: vi.fn(),
}))

const mockedBrowserSupportsWebAuthn = vi.mocked(browserSupportsWebAuthn)
const mockedLoginWithPasskey = vi.mocked(loginWithPasskey)

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>home-marker</div>} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockedLoginWithPasskey.mockReset()
    mockedBrowserSupportsWebAuthn.mockReturnValue(true)
  })

  it('只渲染通行密钥登录按钮：无注册表单、无注册入口', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '使用通行密钥登录' })).toBeInTheDocument()
    expect(screen.queryByLabelText('引导令牌')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /注册/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /首次使用/ })).not.toBeInTheDocument()
  })

  it('点击登录触发 passkey 登录 ceremony，成功后跳主页', async () => {
    const user = userEvent.setup()
    mockedLoginWithPasskey.mockResolvedValue({ authenticated: true, user: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: '使用通行密钥登录' }))

    expect(mockedLoginWithPasskey).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('home-marker')).toBeInTheDocument()
  })

  it('登录失败（网络不可用）→ Toast 展示「服务暂时不可用，请稍后再试」', async () => {
    const user = userEvent.setup()
    mockedLoginWithPasskey.mockRejectedValue(new Error('服务暂时不可用，请稍后再试'))
    renderPage()

    await user.click(screen.getByRole('button', { name: '使用通行密钥登录' }))

    expect(await screen.findByText('服务暂时不可用，请稍后再试')).toBeInTheDocument()
    // 不出现任何注册引导
    expect(screen.queryByRole('button', { name: /注册/ })).not.toBeInTheDocument()
  })

  it('登录失败（服务端错误）→ Toast 透传服务端中文文案', async () => {
    const user = userEvent.setup()
    mockedLoginWithPasskey.mockRejectedValue(new ApiError('没有找到可用的通行密钥', 404))
    renderPage()

    await user.click(screen.getByRole('button', { name: '使用通行密钥登录' }))

    expect(await screen.findByText('没有找到可用的通行密钥')).toBeInTheDocument()
  })

  it('浏览器不支持 WebAuthn → 按钮禁用并展示提示', () => {
    mockedBrowserSupportsWebAuthn.mockReturnValue(false)
    renderPage()
    expect(screen.getByRole('button', { name: '使用通行密钥登录' })).toBeDisabled()
    expect(screen.getByText('当前环境不支持通行密钥（需 HTTPS 或 localhost）')).toBeInTheDocument()
  })
})
