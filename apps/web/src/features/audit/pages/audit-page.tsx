import { Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { AuditLevel } from '../api'
import { AuditLogList } from '../components/audit-log-list'
import { useAuditLogs } from '../queries'

const PAGE_SIZE = 20

const LEVEL_OPTIONS: { value: AuditLevel; label: string }[] = [
  { value: 'info', label: '信息' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '错误' },
]

// 日志页：级别 / 未读筛选 + 分页列表。
// 后端接口未上线时（404）优雅降级为「功能尚未上线」提示，其余错误给重试。
export default function AuditPage() {
  const [level, setLevel] = useState<AuditLevel | undefined>(undefined)
  const [unreadOnly, setUnreadOnly] = useState(true)
  const [page, setPage] = useState(1)

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useAuditLogs({
    page,
    pageSize: PAGE_SIZE,
    level,
    unreadOnly,
  })

  const changeFilter = (apply: () => void) => {
    apply()
    setPage(1)
  }

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    if (isNotImplemented(error)) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-4xl">🚧</p>
          <p className="text-lg font-medium">日志功能尚未上线</p>
          <p className="max-w-sm text-muted-foreground">
            服务端审计模块还在开发中，接口可用后这里会自动展示。
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">加载日志失败</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const logs = data?.items ?? []

  return (
    <div className="flex h-full w-full flex-col items-center">
      <div className="flex w-full max-w-[640px] flex-col gap-2 px-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm">
            <Checkbox
              checked={unreadOnly}
              onCheckedChange={(checked) => changeFilter(() => setUnreadOnly(checked === true))}
            />
            未读
          </Label>
          {LEVEL_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              size="sm"
              variant={level === opt.value ? 'default' : 'outline'}
              className={cn(level === opt.value && 'font-medium', 'whitespace-nowrap')}
              // 级别单选：点已选项取消（回到全部级别）。
              onClick={() =>
                changeFilter(() => setLevel(level === opt.value ? undefined : opt.value))
              }
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <AuditLogList logs={logs} />

        {total > 0 && (
          <div className="flex w-full items-center justify-center gap-3 pb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}（共 {total} 条）
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPlaceholderData}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => refetch()} aria-label="刷新日志">
              <RefreshCw />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// 判断「接口未实现」：API 统一响应 404（ApiError）或反代/Hono 原始 404（ky HTTPError）。
function isNotImplemented(error: Error): boolean {
  if (error instanceof ApiError) return error.status === 404
  const status = (error as { response?: { status?: number } }).response?.status
  return status === 404
}
