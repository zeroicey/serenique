import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'

// 侧边栏 badge 依赖计数 hooks：mock 返回确定值（与硬编码占位 3/2/5 区分开）。
vi.mock('@/app/layout/use-sidebar-counts', () => ({
  useSidebarCounts: () => ({ data: { moments: 7 } }),
}))

vi.mock('@/features/audit/queries', () => ({
  useAuditUnreadCount: () => ({ data: { unreadCount: 9 } }),
}))

describe('AppSidebar', () => {
  it('渲染品牌与全部导航项（对齐移动端顺序）', () => {
    const router = createMemoryRouter([
      { path: '/', element: <SidebarProvider><AppSidebar /></SidebarProvider> },
    ])
    render(<RouterProvider router={router} />)

    // 品牌 logo（alt=Serenique）+ 7 个模块 + 底部设置。
    expect(screen.getByAltText('Serenique')).toBeInTheDocument()
    const labels = ['宁序', '闪记', '习惯', '任务', '日历', '素材库', '日志', '设置']
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('渲染计数 badge：闪记真实值 + 任务/日历/习惯占位 + 日志未读数', () => {
    const router = createMemoryRouter([
      { path: '/', element: <SidebarProvider><AppSidebar /></SidebarProvider> },
    ])
    render(<RouterProvider router={router} />)

    // 闪记=7（mock 真实计数）；任务=3、日历=2、习惯=5（写死占位）；日志=9（未读数）。
    for (const badge of ['7', '3', '2', '5', '9']) {
      expect(screen.getByText(badge)).toBeInTheDocument()
    }
  })
})
