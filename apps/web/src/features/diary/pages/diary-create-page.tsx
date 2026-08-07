import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCreateDiary, useDiaryByDate, useUpdateDiary } from '@/features/diary/queries'
import { diaryFormSchema, type DiaryFormValues } from '@/features/diary/schemas'
import { todayLocal } from '@/lib/date'

// 新建/编辑日记合一：?date= 驱动。有日记 → 编辑态（预填，PUT）；无 → 新建态（POST）。
export default function DiaryCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const today = todayLocal()
  const date = searchParams.get('date') || today

  const { data: existing, isPending: isLoadingDiary } = useDiaryByDate(date)
  const { mutate: createDiary, isPending: isCreating } = useCreateDiary()
  const { mutate: updateDiary, isPending: isUpdating } = useUpdateDiary()
  const isPendingAction = isCreating || isUpdating
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { register, handleSubmit, watch, setValue, reset } = useForm<DiaryFormValues>({
    resolver: zodResolver(diaryFormSchema),
    defaultValues: { content: existing?.content ?? '', diaryDate: date },
  })
  const contentValue = watch('content')
  const isEdit = !!existing

  // 自动增高 textarea。
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 150)}px`
  }, [contentValue])

  // 编辑态：等 useDiaryByDate 返回后预填表单。
  useEffect(() => {
    if (!isLoadingDiary && existing) {
      reset({ content: existing.content, diaryDate: existing.diaryDate })
    }
  }, [isLoadingDiary, existing, reset])

  const onSubmit = handleSubmit((values) => {
    if (isEdit && existing) {
      updateDiary(
        { id: existing.id, content: values.content },
        { onSuccess: () => navigate('/diary') },
      )
    } else {
      createDiary(
        { content: values.content, diaryDate: values.diaryDate },
        { onSuccess: () => navigate('/diary') },
      )
    }
  })

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <form className="flex h-full w-full max-w-[600px] flex-col px-2" onSubmit={onSubmit}>
        <div className="flex-1 space-y-3 overflow-auto">
          <label className="flex w-fit flex-col gap-1">
            <span className="text-sm text-muted-foreground">日期</span>
            <input
              type="date"
              max={today}
              disabled={isEdit}
              {...register('diaryDate')}
              className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <textarea
            {...register('content')}
            ref={(el) => {
              textareaRef.current = el
            }}
            value={contentValue}
            onChange={(e) => setValue('content', e.target.value)}
            placeholder="记录今天的心情…"
            className="min-h-[150px] w-full resize-none p-2 focus:outline-none"
          />
        </div>
        <div className="flex w-full gap-5 border-t p-4">
          <Button
            type="submit"
            className="flex-1 cursor-pointer"
            disabled={isPendingAction || isLoadingDiary}
          >
            {isPendingAction ? '保存中…' : isEdit ? '保存修改' : '保存'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 cursor-pointer"
            disabled={isPendingAction}
            onClick={() => navigate('/diary')}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
