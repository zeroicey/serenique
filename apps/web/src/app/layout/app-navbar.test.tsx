import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppNavbar } from './app-navbar'

describe('AppNavbar', () => {
  it('渲染路由 handle.nav 的动态导航内容', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <SidebarProvider>
            <AppNavbar />
          </SidebarProvider>
        ),
        handle: { nav: <div>测试导航</div> },
      },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByText('测试导航')).toBeInTheDocument()
  })
})
