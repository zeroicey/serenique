import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'

describe('AppSidebar', () => {
  it('渲染品牌与 Moment 导航项', () => {
    const router = createMemoryRouter([
      { path: '/', element: <SidebarProvider><AppSidebar /></SidebarProvider> },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByText('Serenique')).toBeInTheDocument()
    expect(screen.getByText('闪念')).toBeInTheDocument()
  })
})
