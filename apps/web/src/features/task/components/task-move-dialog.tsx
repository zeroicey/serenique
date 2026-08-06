import { useTaskGroups, useUpdateTask } from '@/features/task/queries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { TaskEntry } from '@/features/task/api'

interface TaskMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskEntry
}

// 移动到其他任务组：列出除当前组外的所有组，点击即移动。
export function TaskMoveDialog({ open, onOpenChange, task }: TaskMoveDialogProps) {
  const { data: groups, isPending } = useTaskGroups()
  const { mutate: updateTask } = useUpdateTask()
  const targets = (groups ?? []).filter((g) => g.id !== task.groupId)

  const move = (groupId: string) => {
    updateTask({ id: task.id, groupId })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移动到任务组</DialogTitle>
          <DialogDescription>选择目标任务组，任务将被移入其中。</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-auto">
          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : targets.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              没有其他任务组，请先新建一个。
            </p>
          ) : (
            targets.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => move(group.id)}
                className="w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                {group.title}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
