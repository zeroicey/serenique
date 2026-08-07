import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AuditLogEntry } from '../api'
import { AuditLevelBadge } from './audit-level-badge'

interface AuditLogListProps {
  logs: AuditLogEntry[]
}

// 审计日志列表：居中单列卡片。每张卡显示 时间/级别/事件/消息/来源/IP/已读状态。
// 未读条目左侧加高亮竖条，便于扫读。
export function AuditLogList({ logs }: AuditLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-4xl">🗒️</p>
        <h3 className="text-lg font-medium">暂无日志</h3>
        <p className="max-w-sm text-muted-foreground">服务端还没有记录重要操作。</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {logs.map((log) => (
        <AuditLogCard key={log.id} log={log} />
      ))}
    </div>
  )
}

function AuditLogCard({ log }: { log: AuditLogEntry }) {
  return (
    <article
      className={cn(
        'flex w-full max-w-[640px] flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm shadow-sm',
        !log.isRead && 'border-l-4 border-l-primary',
      )}
    >
      <div className="flex items-center gap-2">
        <AuditLevelBadge level={log.level} />
        <code className="font-mono text-xs text-muted-foreground">{log.event}</code>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDate(log.createdAt)}</span>
          {!log.isRead && <Badge variant="secondary">未读</Badge>}
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground">{log.message}</p>
      {(log.source || log.ip) && (
        <p className="text-xs text-muted-foreground">
          {[log.source, log.ip].filter(Boolean).join(' · ')}
        </p>
      )}
    </article>
  )
}
