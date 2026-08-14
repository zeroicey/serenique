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
import type { TaskEntry } from '@/features/task/api'
import { useUpdateTask } from '@/features/task/queries'
import { type TaskFormValues, taskFormSchema } from '@/features/task/schemas'

interface TaskRenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskEntry
}

// 修改任务内容。
export function TaskRenameDialog({ open, onOpenChange, task }: TaskRenameDialogProps) {
  const { mutate: updateTask } = useUpdateTask()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { title: '' },
  })

  useEffect(() => {
    if (open) reset({ title: task.title })
  }, [open, task, reset])

  const onSubmit = handleSubmit((values) => {
    updateTask({ id: task.id, title: values.title })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改任务</DialogTitle>
          <DialogDescription>修改任务内容。</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">内容</Label>
            <Input
              id="task-title"
              placeholder="任务内容"
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
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
