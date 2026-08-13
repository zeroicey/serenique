import { useState } from 'react'
import {
  ArrowRightLeft,
  MoreHorizontal,
  RotateCcw,
  SquarePen,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteTask, useUpdateTask } from '@/features/task/queries'
import type { TaskEntry } from '@/features/task/api'
import { TaskConfirmDialog } from './task-confirm-dialog'
import { TaskRenameDialog } from './task-rename-dialog'
import { TaskMoveDialog } from './task-move-dialog'

interface TaskItemProps {
  task: TaskEntry
}

// 单条任务：勾选切换 todo/done；已放弃显示 ✕ 代替勾选；下拉菜单含修改 / 移动 / 放弃重建 / 删除。
export function TaskItem({ task }: TaskItemProps) {
  const { mutate: updateTask } = useUpdateTask()
  const { mutate: deleteTask } = useDeleteTask()
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [abandonOpen, setAbandonOpen] = useState(false)
  const [rebuildOpen, setRebuildOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isDone = task.status === 'done'
  const isAbandoned = task.status === 'abandon'

  const toggleDone = (checked: boolean) => {
    updateTask({ id: task.id, status: checked ? 'done' : 'todo' })
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-3',
          isDone && 'bg-muted/40',
          isAbandoned && 'opacity-60',
        )}
      >
        {isAbandoned ? (
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <X className="size-3.5" />
          </span>
        ) : (
          <Checkbox
            checked={isDone}
            onCheckedChange={toggleDone}
            aria-label={`切换任务 ${task.title} 的完成状态`}
          />
        )}

        <span
          className={cn(
            'flex-1 break-words text-sm',
            (isDone || isAbandoned) && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>

        {isDone && task.completedAt && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {formatDate(task.completedAt)} 完成
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="任务操作"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          >
            <MoreHorizontal size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={() => setRenameOpen(true)}>
              <SquarePen className="mr-2 h-4 w-4" />
              修改内容
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => setMoveOpen(true)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              移动到任务组
            </DropdownMenuItem>
            {isAbandoned ? (
              <DropdownMenuItem
                className="cursor-pointer text-blue-600 focus:text-blue-600"
                onClick={() => setRebuildOpen(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                重建
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="cursor-pointer text-orange-600 focus:text-orange-600"
                onClick={() => setAbandonOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                放弃
              </DropdownMenuItem>
            )}
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

      <TaskRenameDialog open={renameOpen} onOpenChange={setRenameOpen} task={task} />
      <TaskMoveDialog open={moveOpen} onOpenChange={setMoveOpen} task={task} />
      <TaskConfirmDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        title="放弃任务"
        description={`确定放弃任务「${task.title}」吗？放弃后任务不可继续勾选完成，但可以重建。`}
        confirmText="放弃"
        onConfirm={() => updateTask({ id: task.id, status: 'abandon' })}
      />
      <TaskConfirmDialog
        open={rebuildOpen}
        onOpenChange={setRebuildOpen}
        title="重建任务"
        description={`确定重建任务「${task.title}」吗？重建后将恢复为待办状态。`}
        confirmText="重建"
        onConfirm={() => updateTask({ id: task.id, status: 'todo' })}
      />
      <TaskConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除任务"
        description={`确定删除任务「${task.title}」吗？删除后不可恢复。`}
        confirmText="删除"
        destructive
        onConfirm={() => deleteTask(task.id)}
      />
    </>
  )
}
