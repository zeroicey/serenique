import { zodResolver } from '@hookform/resolvers/zod'
import { MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCreateMomentWithMedia } from '@/features/moment/queries'
import { momentCreateSchema, type MomentCreateFormValues } from '@/features/moment/schemas'
import { MomentCreateAttachmentGrid } from '@/features/moment/components/moment-create-attachment-grid'
import { MomentLocationPicker } from '@/features/moment/components/moment-location-picker'
import { useLocationConfig } from '@/features/location/queries'
import { formatLocationLabel } from '@/features/location/format'
import type { MomentLocation } from '@/features/moment/api'
import { useMomentDraftStore } from '@/stores/moment-draft'
import type { MediaFile } from '@/types/media'

// 新建闪记：textarea 自动增高 + 附件选择 + 选点位置 + 草稿保存。
export default function MomentCreatePage() {
  const navigate = useNavigate()
  const { draftText, setDraftText, clearDraft } = useMomentDraftStore()
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [location, setLocation] = useState<MomentLocation | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { mutate: createMoment, isPending } = useCreateMomentWithMedia()
  const { data: locationConfig } = useLocationConfig()
  const locationEnabled = locationConfig?.enabled === true

  const { register, handleSubmit, watch, setValue, reset } = useForm<MomentCreateFormValues>({
    resolver: zodResolver(momentCreateSchema),
    defaultValues: { text: draftText },
  })
  const textValue = watch('text')

  useEffect(() => {
    setDraftText(textValue)
  }, [textValue, setDraftText])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 150)}px`
  }, [textValue])

  const onSubmit = handleSubmit((values) => {
    createMoment(
      { text: values.text, files: mediaFiles, location },
      {
        onSuccess: () => {
          reset()
          setMediaFiles([])
          setLocation(null)
          clearDraft()
          navigate('/moment')
        },
      },
    )
  })

  const handleCancel = () => {
    setMediaFiles([])
    setLocation(null)
    clearDraft()
    navigate('/moment')
  }

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <form className="flex h-full w-full max-w-[350px] flex-col" onSubmit={onSubmit}>
        <div className="flex-1 space-y-1 overflow-auto">
          <textarea
            {...register('text')}
            ref={(el) => {
              textareaRef.current = el
            }}
            value={textValue}
            onChange={(e) => setValue('text', e.target.value)}
            placeholder="此刻在想什么？"
            className="min-h-[150px] w-full resize-none p-2 focus:outline-none"
          />
          <MomentCreateAttachmentGrid mediaFiles={mediaFiles} onChange={setMediaFiles} />

          {locationEnabled && (
            <div className="flex items-center justify-between px-2 py-2.5">
              <span className="text-sm">所在位置</span>
              {location ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex cursor-pointer items-center gap-1 text-sm"
                    onClick={() => setPickerOpen(true)}
                  >
                    <MapPin size={14} strokeWidth={1.8} />
                    <span>{formatLocationLabel(location)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="清除位置"
                    className="flex cursor-pointer items-center rounded-md p-0.5 text-muted-foreground hover:bg-accent"
                    onClick={() => setLocation(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setPickerOpen(true)}
                >
                  不显示位置
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex w-full gap-5 border-t p-4">
          <Button type="submit" className="flex-1 cursor-pointer" disabled={isPending}>
            {isPending ? '发布中…' : '发布'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 cursor-pointer"
            disabled={isPending}
            onClick={handleCancel}
          >
            取消
          </Button>
        </div>
      </form>

      <MomentLocationPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setLocation} />
    </div>
  )
}
