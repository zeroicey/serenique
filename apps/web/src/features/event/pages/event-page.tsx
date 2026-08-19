import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { EventEntry } from '@/features/event/api'
import { EventDateNav } from '@/features/event/components/event-date-nav'
import { EventFormDialog } from '@/features/event/components/event-form-dialog'
import { EventList } from '@/features/event/components/event-list'
import { todayLocal } from '@/lib/date'

// 单日日历页：新建按钮 + 日期栏（过滤）+ 当日事件列表 + 新建/编辑弹窗。
// 顶部导航栏已移除（2026-08-20）：原顶栏「新建日历」下沉到本页；
// viewedDate/createOpen/editingEvent 由本页 useState 持有（原 event-ui store 已删除）。
export default function EventPage() {
  const [viewedDate, setViewedDate] = useState(todayLocal())
  const [createOpen, setCreateOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<EventEntry | null>(null)

  const openCreate = () => setCreateOpen(true)
  const openEdit = (event: EventEntry) => {
    setEditingEvent(event)
    setCreateOpen(true)
  }
  const close = () => {
    setCreateOpen(false)
    setEditingEvent(null)
  }

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <EventDateNav viewedDate={viewedDate} onDateChange={setViewedDate} />
          <Button variant="outline" onClick={openCreate}>
            <Plus />
            新建
          </Button>
        </div>
        <EventList viewedDate={viewedDate} onEdit={openEdit} />
        <EventFormDialog
          open={createOpen}
          editing={editingEvent}
          viewedDate={viewedDate}
          onClose={close}
        />
      </div>
    </div>
  )
}
