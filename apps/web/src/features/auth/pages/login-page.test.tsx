import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOidcAuthorizeUrl } from '../api'
import LoginPage from './login-page'

// 登录页只负责「取授权地址 → 整页跳转」；mock api 层，验证跳转行为与错误文案。
vi.mock('../api', () => ({
  fetchOidcAuthorizeUrl: vi.fn(),
}))

const mockedFetchOidcAuthorizeUrl = vi.mocked(fetchOidcAuthorizeUrl)

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
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockedFetchOidcAuthorizeUrl.mockReset()
  })

  it('渲染「前往登录」按钮：无注册入口、无令牌输入', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '前往登录' })).toBeInTheDocument()
    expect(screen.queryByLabelText('引导令牌')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /注册/ })).not.toBeInTheDocument()
  })

  it('点击登录 → 取授权地址并整页跳转认证中心', async () => {
    const user = userEvent.setup()
    mockedFetchOidcAuthorizeUrl.mockResolvedValue({
      authorizationUrl: 'https://auth.zeroicey.me/authorize?client_id=x&state=s1',
    })
    const assignSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: assignSpy })
    try {
      renderPage()
      await user.click(screen.getByRole('button', { name: '前往登录' }))
      expect(mockedFetchOidcAuthorizeUrl).toHaveBeenCalledTimes(1)
      expect(assignSpy).toHaveBeenCalledWith(
        'https://auth.zeroicey.me/authorize?client_id=x&state=s1',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('取地址失败（网络不可用）→ 页内中文提示，不跳转、可重试', async () => {
    const user = userEvent.setup()
    mockedFetchOidcAuthorizeUrl.mockRejectedValue(new Error('无法连接服务器'))
    renderPage()

    await user.click(screen.getByRole('button', { name: '前往登录' }))

    expect(await screen.findByText(/无法连接服务器|请检查网络/)).toBeInTheDocument()
    // 按钮恢复可用（可重试）
    expect(screen.getByRole('button', { name: '前往登录' })).toBeEnabled()
  })
})
