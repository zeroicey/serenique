import { EventDateNav } from '@/features/event/components/event-date-nav'
import { EventFormDialog } from '@/features/event/components/event-form-dialog'
import { EventList } from '@/features/event/components/event-list'

// 单日日程页：日期栏（过滤）+ 当日事件列表 + 新建/编辑弹窗。
export default function EventPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2">
        <EventDateNav />
        <EventList />
      </div>
      <EventFormDialog />
    </div>
  )
}
