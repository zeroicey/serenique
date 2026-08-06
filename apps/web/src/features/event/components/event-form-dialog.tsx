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
import { useCreateEvent, useUpdateEvent } from '@/features/event/queries'
import { eventFormSchema, type EventFormValues } from '@/features/event/schemas'
import { toLocalInputValue, toLocalISO } from '@/features/event/lib'
import { useEventUIStore } from '@/stores/event-ui'

// 新建 / 编辑日程合一弹窗。状态驱动自 event-ui store（顶栏「新建日程」与页面编辑入口共用）。
// 全天事件只填日期：勾选后隐藏起止时间，用一个 date 输入同时驱动 startAt/endAt（00:00 – 23:59）。
export function EventFormDialog() {
  const { createOpen, editingEvent, viewedDate, close } = useEventUIStore()
  const { mutate: createEvent, isPending: isCreating } = useCreateEvent()
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent()
  const isPendingAction = isCreating || isUpdating

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: { title: '', startAt: '', endAt: '', isAllDay: false, location: '', note: '' },
  })
  const isAllDay = watch('isAllDay')
  const startAt = watch('startAt')

  // 打开时重置表单：新建默认取当前查看日期 09:00–10:00；编辑回填。
  useEffect(() => {
    if (!createOpen) return
    if (editingEvent) {
      reset({
        title: editingEvent.title,
        startAt: toLocalInputValue(editingEvent.startAt),
        endAt: toLocalInputValue(editingEvent.endAt),
        isAllDay: editingEvent.isAllDay,
        location: editingEvent.location ?? '',
        note: editingEvent.note ?? '',
      })
    } else {
      reset({
        title: '',
        startAt: `${viewedDate}T09:00`,
        endAt: `${viewedDate}T10:00`,
        isAllDay: false,
        location: '',
        note: '',
      })
    }
  }, [createOpen, editingEvent, viewedDate, reset])

  const handleAllDayDateChange = (value: string) => {
    if (!value) return
    setValue('startAt', `${value}T00:00`)
    setValue('endAt', `${value}T23:59`)
  }

  const onSubmit = handleSubmit((values) => {
    const startAt = toLocalISO(values.startAt)
    const endAt = toLocalISO(values.endAt)
    if (editingEvent) {
      updateEvent(
        {
          id: editingEvent.id,
          title: values.title,
          startAt,
          endAt,
          isAllDay: values.isAllDay,
          // PUT 部分更新：传空串即清空（对齐后端语义）。
          location: values.location || '',
          note: values.note || '',
        },
        { onSuccess: () => close() },
      )
    } else {
      createEvent(
        {
          title: values.title,
          startAt,
          endAt,
          isAllDay: values.isAllDay,
          location: values.location || undefined,
          note: values.note || undefined,
        },
        { onSuccess: () => close() },
      )
    }
  })

  return (
    <Dialog open={createOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingEvent ? '编辑日程' : '新建日程'}</DialogTitle>
          <DialogDescription>
            {editingEvent ? '修改日程信息。' : '添加一个日程事件。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">标题</Label>
            <Input
              id="event-title"
              placeholder="日程标题"
              autoFocus
              aria-invalid={!!errors.title}
              {...register('title')}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={isAllDay}
              onCheckedChange={(checked) => {
                const on = !!checked
                setValue('isAllDay', on)
                // 开启全天后立即把起止归一到 00:00 – 23:59，避免沿用时段默认值（09:00）提交。
                if (on) {
                  const date = getValues('startAt').slice(0, 10)
                  if (date) {
                    setValue('startAt', `${date}T00:00`)
                    setValue('endAt', `${date}T23:59`)
                  }
                }
              }}
              aria-label="全天"
            />
            <span>全天（不显示具体时间）</span>
          </label>

          {isAllDay ? (
            <div className="space-y-1.5">
              <Label htmlFor="event-all-day-date">日期</Label>
              <Input
                id="event-all-day-date"
                type="date"
                value={startAt.slice(0, 10)}
                onChange={(e) => handleAllDayDateChange(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="event-start">开始</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  aria-invalid={!!errors.startAt}
                  {...register('startAt')}
                />
                {errors.startAt && (
                  <p className="text-xs text-destructive">{errors.startAt.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-end">结束</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  aria-invalid={!!errors.endAt}
                  {...register('endAt')}
                />
                {errors.endAt && <p className="text-xs text-destructive">{errors.endAt.message}</p>}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="event-location">地点</Label>
            <Input id="event-location" placeholder="可选" {...register('location')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-note">备注</Label>
            <Textarea id="event-note" placeholder="可选" {...register('note')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
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
