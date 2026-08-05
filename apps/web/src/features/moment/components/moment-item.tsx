import { Clock, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@/lib/format'
import { useDeleteMoment } from '@/features/moment/queries'
import type { MomentEntry } from '@/features/moment/api'
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
import { MomentAttachmentGrid } from './moment-attachment-grid'

interface MomentItemProps {
  moment: MomentEntry
}

const TEXT_TRUNCATE = 150

// 单条闪念卡片：文字（超长截断）+ 附件网格 + 时间/字数 + 删除。
export function MomentItem({ moment }: MomentItemProps) {
  const { mutate: deleteMoment } = useDeleteMoment()
  const [textExpanded, setTextExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const showToggle = moment.text.length > TEXT_TRUNCATE
  const text = showToggle && !textExpanded ? moment.text.slice(0, TEXT_TRUNCATE) + '…' : moment.text

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-2">
      <div className="text-base">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {showToggle && (
          <button
            className="mt-1 text-sm text-blue-600 hover:underline"
            onClick={() => setTextExpanded((v) => !v)}
          >
            {textExpanded ? '收起' : '展开'}
          </button>
        )}
      </div>

      <MomentAttachmentGrid attachments={moment.attachments} />

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock size={14} strokeWidth={1.8} />
          <span>{formatDate(moment.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{moment.text.length} 字</span>
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
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除闪念</DialogTitle>
            <DialogDescription>确定删除这条闪念吗？删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMoment(moment.id)
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
