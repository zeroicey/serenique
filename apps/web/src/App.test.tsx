import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// App 外层套了 AuthGuard：未登录会被重定向到 /login。此处 mock 认证状态为已登录，
// 以便渲染真实应用外壳。
vi.mock('@/features/auth/api', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
}))

describe('App', () => {
  it('渲染应用外壳', async () => {
    render(<App />)
    // AuthGuard 探到已登录后才会渲染应用外壳，故用 findByText 等待。
    expect(await screen.findByText('Serenique')).toBeInTheDocument()
  })
})
