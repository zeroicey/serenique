import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, MapPin, Tag as TagIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
// 跨 feature 数据 hook：位置配置查询属 location 域，moment 创建页消费是刻意豁免（规则 5）。
import { useLocationConfig } from '@/features/location/queries'
import type { MomentLocation } from '@/features/moment/api'
import { MomentCreateAttachmentGrid } from '@/features/moment/components/moment-create-attachment-grid'
import { MomentLocationPicker } from '@/features/moment/components/moment-location-picker'
import { useCreateMomentWithMedia } from '@/features/moment/queries'
import { type MomentCreateFormValues, momentCreateSchema } from '@/features/moment/schemas'
import { TagPicker } from '@/features/tag/components/tag-picker'
import { useTags } from '@/features/tag/queries'
import { formatLocationLabel } from '@/lib/location'
import { useMomentDraftStore } from '@/stores/moment-draft'
import type { MediaFile } from '@/types/media'

// 新建闪记：textarea 自动增高 + 附件选择 + 选点位置 + 打标签（只选已有）+ 草稿保存。
export default function MomentCreatePage() {
  const navigate = useNavigate()
  const { draftText, setDraftText, clearDraft } = useMomentDraftStore()
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [location, setLocation] = useState<MomentLocation | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [editTagsOpen, setEditTagsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { mutate: createMoment, isPending } = useCreateMomentWithMedia()
  const { data: locationConfig } = useLocationConfig()
  const locationEnabled = locationConfig?.enabled === true
  const { data: allTags } = useTags()
  const selectedTags = allTags?.filter((t) => tagIds.includes(t.id)) ?? []

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: 意图性依赖——输入变化时自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 150)}px`
  }, [textValue])

  const onSubmit = handleSubmit((values) => {
    createMoment(
      { text: values.text, files: mediaFiles, location, tags: tagIds },
      {
        onSuccess: () => {
          // reset({ text: '' }) 而非 reset()：后者回退到 defaultValues 快照
          // （可能是历史草稿），useEffect 会把它写回 store 造成草稿残留
          reset({ text: '' })
          setMediaFiles([])
          setLocation(null)
          setTagIds([])
          clearDraft()
          navigate('/moment')
        },
      },
    )
  })

  const handleCancel = () => {
    setMediaFiles([])
    setLocation(null)
    setTagIds([])
    // 取消不清草稿：误触取消也应保留已输入文字（localStorage 兜底），下次进入恢复
    navigate('/moment')
  }

  return (
    <div className="flex h-full w-full flex-col justify-center overflow-auto">
      <div className="flex justify-center">
        <div className="flex w-full max-w-[350px] items-center px-1 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => navigate('/moment')}
          >
            <ChevronLeft />
            闪记
          </Button>
        </div>
      </div>
      <form
        className="flex min-h-0 w-full max-w-[350px] flex-1 flex-col justify-center self-center"
        onSubmit={onSubmit}
      >
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

          {/* 打标签：只选已有标签（TagPicker 纯受控，不提供新建入口）。 */}
          <div className="px-2 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm">标签</span>
              {selectedTags.length > 0 ? (
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1 text-sm"
                  onClick={() => setEditTagsOpen((v) => !v)}
                >
                  <TagIcon size={14} strokeWidth={1.8} />
                  <span>{selectedTags.map((t) => `#${t.name}`).join(' ')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setEditTagsOpen((v) => !v)}
                >
                  添加标签
                </button>
              )}
            </div>
            {editTagsOpen && (
              <div className="mt-2">
                <TagPicker tags={allTags ?? []} selectedIds={tagIds} onChange={setTagIds} />
              </div>
            )}
          </div>
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
