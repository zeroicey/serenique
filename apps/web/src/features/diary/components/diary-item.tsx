import { useState } from 'react'
import { CalendarDays, MoreHorizontal, Trash2 } from 'lucide-react'
import { formatDateOnly } from '@/lib/date'
import { useDeleteDiary } from '@/features/diary/queries'
import type { DiaryEntry } from '@/features/diary/api'
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

interface DiaryItemProps {
  diary: DiaryEntry
}

const TEXT_TRUNCATE = 150

// 单篇日记卡片：日期 + 内容截断（展开/收起）+ 字数 + 删除（确认对话框）。
export function DiaryItem({ diary }: DiaryItemProps) {
  const { mutate: deleteDiary } = useDeleteDiary()
  const [contentExpanded, setContentExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const showToggle = diary.content.length > TEXT_TRUNCATE
  const content =
    showToggle && !contentExpanded ? diary.content.slice(0, TEXT_TRUNCATE) + '…' : diary.content

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarDays size={14} strokeWidth={1.8} />
        <span className="text-sm">{formatDateOnly(diary.diaryDate)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
      {showToggle && (
        <button
          className="self-start text-sm text-blue-600 hover:underline"
          onClick={() => setContentExpanded((v) => !v)}
        >
          {contentExpanded ? '收起' : '展开'}
        </button>
      )}
      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{diary.content.length} 字</span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除日记</DialogTitle>
            <DialogDescription>确定删除这篇日记吗？删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteDiary(diary.id)
                setDeleteOpen(false)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
