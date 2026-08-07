import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import AuditPage from './audit-page'
import { useAuditLogs } from '../queries'
import type { AuditLogEntry } from '../api'

// mock 掉 audit 数据 hook，页面只测渲染与交互。
vi.mock('../queries', () => ({
  useAuditLogs: vi.fn(),
}))

const mockedUseAuditLogs = vi.mocked(useAuditLogs)

function makeLog(id: string, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id,
    event: 'auth.login',
    message: '登录成功',
    level: 'info',
    source: null,
    ip: '127.0.0.1',
    detail: null,
    isRead: false,
    createdAt: '2026-08-08T01:00:00.000Z',
    ...overrides,
  }
}

type QueryState = {
  data?: { items: AuditLogEntry[]; total: number }
  isPending?: boolean
  isError?: boolean
  error?: Error | null
  isPlaceholderData?: boolean
}

function renderPage(state: QueryState = {}) {
  mockedUseAuditLogs.mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    error: state.error ?? null,
    isPlaceholderData: state.isPlaceholderData ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAuditLogs>)
  return render(<AuditPage />)
}

describe('AuditPage', () => {
  it('加载中显示 spinner', () => {
    renderPage({ isPending: true })
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('渲染筛选条与日志列表', () => {
    renderPage({ data: { items: [makeLog('a', { message: '文件已删除', level: 'warn' })], total: 1 } })
    // 级别筛选是按钮（避免与日志卡上的级别角标文本撞车，用 role 查）。
    for (const label of ['信息', '警告', '错误']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // 未读筛选：label 关联的 checkbox（默认勾选）。
    expect(screen.getByRole('checkbox', { name: '未读' })).toBeChecked()
    expect(screen.getByText('文件已删除')).toBeInTheDocument()
  })

  it('切换级别/未读筛选后回到第一页', async () => {
    const user = userEvent.setup()
    renderPage({ data: { items: [], total: 0 } })
    await user.click(screen.getByRole('button', { name: '警告' }))
    expect(mockedUseAuditLogs).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      level: 'warn',
      unreadOnly: true,
    })
  })

  it('404（接口未上线）时优雅降级提示', () => {
    renderPage({ isError: true, error: new ApiError('Not Found', 404) })
    expect(screen.getByText('日志功能尚未上线')).toBeInTheDocument()
  })

  it('其他错误显示重试', () => {
    renderPage({ isError: true, error: new Error('boom') })
    expect(screen.getByText('加载日志失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('超过一页时分页按钮可用', () => {
    renderPage({ data: { items: Array.from({ length: 20 }, (_, i) => makeLog(`l${i}`)), total: 41 } })
    expect(screen.getByText(/共 41 条/)).toBeInTheDocument()
    const prev = screen.getByRole('button', { name: '上一页' })
    expect(prev).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled()
  })
})
