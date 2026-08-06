import { useState } from 'react'
import { SquarePen, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDeleteTaskGroup } from '@/features/task/queries'
import type { TaskGroupEntry } from '@/features/task/api'
import { TaskGroupDialog } from './task-group-dialog'
import { TaskConfirmDialog } from './task-confirm-dialog'

interface TaskGroupItemProps {
  group: TaskGroupEntry
  selected: boolean
  onSelect: () => void
}

// 单个任务组：点击选中；hover 显示重命名 / 删除。
export function TaskGroupItem({ group, selected, onSelect }: TaskGroupItemProps) {
  const { mutate: deleteTaskGroup } = useDeleteTaskGroup()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <div
        onClick={onSelect}
        className={cn(
          'group flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors',
          selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
        )}
      >
        <span className="flex-1 truncate">{group.title}</span>
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setRenameOpen(true)
            }}
            className="cursor-pointer rounded p-1 hover:bg-accent"
            title="重命名"
            aria-label={`重命名任务组 ${group.title}`}
          >
            <SquarePen className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteOpen(true)
            }}
            className="cursor-pointer rounded p-1 hover:bg-destructive/10 hover:text-destructive"
            title="删除"
            aria-label={`删除任务组 ${group.title}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <TaskGroupDialog mode="rename" group={group} open={renameOpen} onOpenChange={setRenameOpen} />
      <TaskConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除任务组"
        description={`确定删除任务组「${group.title}」吗？组内所有任务会一并删除，且不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={() => deleteTaskGroup(group.id)}
      />
    </>
  )
}
