import { useState } from 'react'
import { MapPin, MoreHorizontal, SquarePen, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteEvent } from '@/features/event/queries'
import { eventTimeLabel } from '@/features/event/lib'
import { useEventUIStore } from '@/stores/event-ui'
import type { EventEntry } from '@/features/event/api'

const NOTE_TRUNCATE = 150

interface EventItemProps {
  event: EventEntry
}

// 单条日程卡片：时间（全天徽标 / 时段 HH:mm – HH:mm）+ 标题 + 地点 + 备注截断 + 编辑/删除。
export function EventItem({ event }: EventItemProps) {
  const { mutate: deleteEvent } = useDeleteEvent()
  const { openEdit } = useEventUIStore()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [noteExpanded, setNoteExpanded] = useState(false)

  const showNoteToggle = (event.note?.length ?? 0) > NOTE_TRUNCATE
  const note =
    showNoteToggle && !noteExpanded ? event.note!.slice(0, NOTE_TRUNCATE) + '…' : event.note

  return (
    <>
      <div className="flex w-full items-start gap-3 px-3 py-3">
        <div className="flex w-28 shrink-0 items-center pt-0.5 text-sm text-muted-foreground">
          {event.isAllDay ? (
            <Badge variant="secondary">全天</Badge>
          ) : (
            <span>{eventTimeLabel(event)}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="break-words text-sm font-medium">{event.title}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="日程操作"
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
              >
                <MoreHorizontal size={18} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(event)}>
                  <SquarePen className="mr-2 h-4 w-4" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {event.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={13} strokeWidth={1.8} />
              <span className="break-words">{event.location}</span>
            </div>
          )}

          {event.note && (
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {note}
              {showNoteToggle && (
                <button
                  className="ml-1 cursor-pointer text-blue-600 hover:underline"
                  onClick={() => setNoteExpanded((v) => !v)}
                >
                  {noteExpanded ? '收起' : '展开'}
                </button>
              )}
            </p>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除日程</DialogTitle>
            <DialogDescription>确定删除「{event.title}」吗？删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteEvent(event.id)
                setDeleteOpen(false)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
