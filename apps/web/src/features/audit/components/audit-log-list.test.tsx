import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditLogList } from './audit-log-list'
import type { AuditLogEntry } from '../api'

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

describe('AuditLogList', () => {
  it('空列表显示空态', () => {
    render(<AuditLogList logs={[]} />)
    expect(screen.getByText('暂无日志')).toBeInTheDocument()
  })

  it('渲染时间/级别/事件/消息/来源/IP/已读', () => {
    render(
      <AuditLogList
        logs={[
          makeLog('a', { message: '文件已删除', level: 'warn', source: 'cli', isRead: true }),
          makeLog('b', { event: 'auth.login_failed', message: '登录失败', level: 'error' }),
        ]}
      />,
    )
    expect(screen.getByText('文件已删除')).toBeInTheDocument()
    expect(screen.getByText('警告')).toBeInTheDocument()
    expect(screen.getByText('登录失败')).toBeInTheDocument()
    expect(screen.getByText('错误')).toBeInTheDocument()
    // 来源 · IP 合并行。
    expect(screen.getByText('cli · 127.0.0.1')).toBeInTheDocument()
    // 已读的一条不显示「未读」，未读的一条显示。
    expect(screen.queryByText('未读')).toBeInTheDocument()
    expect(screen.getAllByText('未读')).toHaveLength(1)
    // 事件 key 以 code 形式展示。
    expect(screen.getByText('auth.login_failed')).toBeInTheDocument()
  })
})
