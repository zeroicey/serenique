import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SessionSwitcher } from './session-switcher'
import { useAiStore } from '@/features/ai/store/ai-store'

function renderSwitcher() {
  return render(<SessionSwitcher />)
}

describe('SessionSwitcher', () => {
  test('触发器显示当前会话名', () => {
    useAiStore.setState({
      sessions: [{ id: 'a', name: '今天计划', messageCount: 3, modified: '' }],
      currentSessionId: 'a',
    })
    renderSwitcher()
    expect(screen.getByText('今天计划')).toBeTruthy()
  })

  test('无会话时显示「新会话」', () => {
    useAiStore.setState({ sessions: [], currentSessionId: null })
    renderSwitcher()
    expect(screen.getByText('新会话')).toBeTruthy()
  })

  test('打开菜单点击会话触发 switchSession', () => {
    const switched: string[] = []
    useAiStore.setState({
      sessions: [
        { id: 'a', name: '今天计划', messageCount: 3, modified: '' },
        { id: 'b', name: '新会话', messageCount: 0, modified: '' },
      ],
      currentSessionId: 'a',
      switchSession: (id) => switched.push(id),
    })
    renderSwitcher()
    fireEvent.click(screen.getByText('今天计划')) // 打开菜单（base-ui trigger 默认渲染 button）
    fireEvent.click(screen.getByText('新会话'))
    expect(switched).toEqual(['b'])
  })

  test('新建会话项触发 newSession', () => {
    const created: unknown[] = []
    useAiStore.setState({
      sessions: [],
      currentSessionId: null,
      newSession: () => created.push('new'),
    })
    renderSwitcher()
    fireEvent.click(screen.getByText('新会话')) // 打开菜单
    fireEvent.click(screen.getByText('新建会话'))
    expect(created).toEqual(['new'])
  })

  test('删除触发 confirm + deleteSession', () => {
    const del: string[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAiStore.setState({
      sessions: [{ id: 'a', name: '今天计划', messageCount: 1, modified: '' }],
      currentSessionId: 'a',
      deleteSession: (id) => del.push(id),
    })
    renderSwitcher()
    fireEvent.click(screen.getByText('今天计划')) // 打开菜单
    fireEvent.click(screen.getByLabelText('删除会话 今天计划'))
    expect(del).toEqual(['a'])
    vi.restoreAllMocks()
  })
})
