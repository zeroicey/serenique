import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { SessionSidebar } from './session-sidebar'

describe('SessionSidebar', () => {
  test('渲染会话列表与当前项高亮', () => {
    useAiStore.setState({
      sessions: [
        { id: 'a', name: '今天计划', messageCount: 3, modified: '' },
        { id: 'b', name: '新会话', messageCount: 0, modified: '' },
      ],
      currentSessionId: 'a',
    })
    render(<SessionSidebar />)
    expect(screen.getByText('今天计划')).toBeTruthy()
    expect(screen.getByText('新会话')).toBeTruthy()
  })

  test('点击会话触发 switchSession', () => {
    const switched: string[] = []
    useAiStore.setState({
      sessions: [{ id: 'b', name: '新会话', messageCount: 0, modified: '' }],
      currentSessionId: 'a',
      switchSession: (id: string) => switched.push(id),
    })
    render(<SessionSidebar />)
    fireEvent.click(screen.getByText('新会话'))
    expect(switched).toEqual(['b'])
  })

  test('删除触发 confirm + deleteSession', () => {
    const del: string[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAiStore.setState({
      sessions: [{ id: 'a', name: '今天计划', messageCount: 1, modified: '' }],
      currentSessionId: 'a',
      deleteSession: (id: string) => del.push(id),
    })
    render(<SessionSidebar />)
    fireEvent.click(screen.getByTitle('删除'))
    expect(del).toEqual(['a'])
    vi.restoreAllMocks()
  })
})
