import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuditUnreadCount, useMarkAuditRead } from '../queries'

// 日志页动态导航：标题「日志」+ 全部置已读按钮（无未读时禁用）。
export function AuditNav() {
  const { data: unread } = useAuditUnreadCount()
  const markRead = useMarkAuditRead()
  const unreadCount = unread?.unreadCount ?? 0

  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">日志</span>
      <Button
        variant="outline"
        onClick={() => markRead.mutate(undefined)}
        disabled={unreadCount === 0 || markRead.isPending}
      >
        <CheckCheck />
        全部置已读
      </Button>
    </div>
  )
}
