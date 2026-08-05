import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './theme-toggle'

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }))

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme }),
}))

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
}))

describe('ThemeToggle', () => {
  it('渲染「主题」触发器', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: '主题' })).toBeInTheDocument()
  })

  it('点击三项调用对应 setTheme', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const trigger = screen.getByRole('button', { name: '主题' })

    await user.click(trigger)
    await user.click(await screen.findByText('浅色'))
    expect(setTheme).toHaveBeenCalledWith('light')

    await user.click(trigger)
    await user.click(await screen.findByText('深色'))
    expect(setTheme).toHaveBeenCalledWith('dark')

    await user.click(trigger)
    await user.click(await screen.findByText('跟随系统'))
    expect(setTheme).toHaveBeenCalledWith('system')
  })
})
