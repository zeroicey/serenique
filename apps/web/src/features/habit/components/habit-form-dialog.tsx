import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import type { HabitEntry } from '@/features/habit/api'
import { useCreateHabit, useUpdateHabit } from '@/features/habit/queries'
import { type HabitFormValues, habitFormSchema } from '@/features/habit/schemas'
import { cn } from '@/lib/utils'

interface HabitFormDialogProps {
  open: boolean
  editing: HabitEntry | null
  onClose: () => void
}

// 新建 / 编辑习惯选项弹窗：名称 + 类型（好事/坏事）+ 可计数开关 + 排序号 + 简介（可选）。
// countable 切换只影响后续写入，历史每日状态不迁移（服务端契约，弹窗内说明）。
// 状态由所属页面 useState 注入（原 habit-ui store 已删除，2026-08-20 顶部导航栏移除后
// 不再需要跨顶栏/页面共享）。
export function HabitFormDialog({ open, editing, onClose }: HabitFormDialogProps) {
  const { mutate: createHabit, isPending: isCreating } = useCreateHabit()
  const { mutate: updateHabit, isPending: isUpdating } = useUpdateHabit()
  const isPendingAction = isCreating || isUpdating

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: { name: '', kind: 'good', countable: false, sortOrder: '', description: '' },
  })
  const kind = watch('kind')
  const countable = watch('countable')

  // 打开时重置表单：编辑回填，新建默认好事 + 排序 0。
  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        name: editing.name,
        kind: editing.kind,
        countable: editing.countable,
        sortOrder: String(editing.sortOrder),
        description: editing.description ?? '',
      })
    } else {
      reset({ name: '', kind: 'good', countable: false, sortOrder: '', description: '' })
    }
  }, [open, editing, reset])

  const onSubmit = handleSubmit((values) => {
    const sortOrder = values.sortOrder === '' ? undefined : Number(values.sortOrder)
    const description = values.description?.trim()
    if (editing) {
      updateHabit(
        {
          id: editing.id,
          name: values.name,
          kind: values.kind,
          countable: values.countable,
          sortOrder,
          // 编辑时总是带 description：空串 → null 清除（服务端契约）。
          description: description || null,
        },
        { onSuccess: () => onClose() },
      )
    } else {
      // 新建契约（POST /api/habits）name/kind/countable + 可选 description；sortOrder 默认 0。
      createHabit(
        {
          name: values.name,
          kind: values.kind,
          countable: values.countable,
          ...(description ? { description } : {}),
        },
        { onSuccess: () => onClose() },
      )
    }
  })

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '编辑习惯' : '新建习惯'}</DialogTitle>
          <DialogDescription>
            {editing ? '修改习惯选项。' : '添加一个想记录的事项。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="habit-name">名称</Label>
            <Input
              id="habit-name"
              placeholder="如：跑步、读书、喝水"
              autoFocus
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>类型</Label>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="好事"
                aria-pressed={kind === 'good'}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                  kind === 'good'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border hover:bg-muted',
                )}
                onClick={() => setValue('kind', 'good')}
              >
                ✓ 好事
              </button>
              <button
                type="button"
                aria-label="坏事"
                aria-pressed={kind === 'bad'}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                  kind === 'bad'
                    ? 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400'
                    : 'border-border hover:bg-muted',
                )}
                onClick={() => setValue('kind', 'bad')}
              >
                ✗ 坏事
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={countable}
              onCheckedChange={(checked) => setValue('countable', !!checked)}
              aria-label="可计数"
            />
            <span>可计数（喝水这类一天多次的习惯，点 +1 记录次数）</span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="habit-description">简介（可选）</Label>
            <Textarea
              id="habit-description"
              placeholder="如：每天晨跑 5 公里"
              rows={2}
              maxLength={500}
              aria-invalid={!!errors.description}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="habit-sort">排序号（越小越靠前）</Label>
            <Input
              id="habit-sort"
              inputMode="numeric"
              placeholder="默认 0"
              aria-invalid={!!errors.sortOrder}
              {...register('sortOrder')}
            />
            {errors.sortOrder && (
              <p className="text-xs text-destructive">{errors.sortOrder.message}</p>
            )}
          </div>

          {editing && (
            <p className="text-xs text-muted-foreground">切换「可计数」不影响已记录的历史数据。</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isPendingAction}>
              {isPendingAction ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
