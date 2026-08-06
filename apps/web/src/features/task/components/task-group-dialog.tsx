import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateTaskGroup, useUpdateTaskGroup } from '@/features/task/queries'
import { taskGroupFormSchema, type TaskGroupFormValues } from '@/features/task/schemas'
import type { TaskGroupEntry } from '@/features/task/api'

// 新建 / 重命名任务组合一：mode 区分，group 仅重命名时传入。提交走对应 mutation。
interface TaskGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'rename'
  group?: TaskGroupEntry | null
}

export function TaskGroupDialog({ open, onOpenChange, mode, group }: TaskGroupDialogProps) {
  const { mutate: createTaskGroup } = useCreateTaskGroup()
  const { mutate: updateTaskGroup } = useUpdateTaskGroup()
  const isCreate = mode === 'create'

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskGroupFormValues>({
    resolver: zodResolver(taskGroupFormSchema),
    defaultValues: { title: '' },
  })

  // 打开时预填（重命名态取当前标题）。
  useEffect(() => {
    if (open) reset({ title: group?.title ?? '' })
  }, [open, group, reset])

  const onSubmit = handleSubmit((values) => {
    if (isCreate) {
      createTaskGroup({ title: values.title })
    } else if (group) {
      updateTaskGroup({ id: group.id, title: values.title })
    }
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? '新建任务组' : '重命名任务组'}</DialogTitle>
          <DialogDescription>
            {isCreate ? '创建一个新的任务组来组织任务。' : '修改任务组的名称。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="task-group-title">名称</Label>
            <Input
              id="task-group-title"
              placeholder="任务组名称"
              autoFocus
              aria-invalid={!!errors.title}
              {...register('title')}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">{isCreate ? '创建' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
