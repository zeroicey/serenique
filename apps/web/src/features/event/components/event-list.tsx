import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { todayLocal } from '@/lib/date'
import { useEvents } from '@/features/event/queries'
import { useEventUIStore } from '@/stores/event-ui'
import { EventItem } from './event-item'

// 单日事件列表：加载 / 错误（重试）/ 空态 / 卡片列表。
export function EventList() {
  const { viewedDate } = useEventUIStore()
  const { isPending, isError, refetch, data } = useEvents(viewedDate)

  if (isPending) {
    return (
      <div className="flex w-full items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 py-12">
        <p className="text-muted-foreground">加载日程失败</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const events = data ?? []
  if (events.length === 0) {
    const isToday = viewedDate === todayLocal()
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-4xl">📅</p>
        <h3 className="text-lg font-medium">{isToday ? '今天没有日程' : '这一天没有日程'}</h3>
        <p className="max-w-sm text-muted-foreground">点击右上角「新建日程」，安排你的一天。</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col">
      {events.map((event) => (
        <div key={event.id} className="flex w-full flex-col">
          <EventItem event={event} />
          <div className="my-1 w-full border-b" />
        </div>
      ))}
    </div>
  )
}
