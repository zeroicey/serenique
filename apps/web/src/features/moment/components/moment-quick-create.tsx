import { Expand, MapPin, Paperclip, Send, Tag as TagIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCreateMomentWithMedia } from '@/features/moment/queries'
import { useMomentDraftStore } from '@/stores/moment-draft'

// 列表页内嵌快速新建（第一版仅文字）：顶部 textarea + 下方工具栏。
// 工具栏左侧是位置/标签/上传三个入口（本次置灰占位）+ 一个「展开」按钮进入独立完整编辑页；
// 右侧是发送按钮。正文草稿复用 localStorage 草稿 store（进独立页可无缝续写）。
export function MomentQuickCreate() {
  const navigate = useNavigate()
  const { draftText, setDraftText, clearDraft } = useMomentDraftStore()
  const [text, setText] = useState(draftText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { mutate: createMoment, isPending } = useCreateMomentWithMedia()

  useEffect(() => {
    setDraftText(text)
  }, [text, setDraftText])

  // biome-ignore lint/correctness/useExhaustiveDependencies: 意图性依赖——输入变化时自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`
  }, [text])

  const canSubmit = text.trim().length > 0 && !isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    createMoment(
      { text: text.trim(), files: [], location: null, tags: [] },
      {
        onSuccess: () => {
          setText('')
          // 清空草稿，避免发布后刷新本地恢复出已发布的正文。
          clearDraft()
        },
      },
    )
  }

  // 本版仅文字：位置/标签/上传入口置灰占位，完整能力走「展开」→ /moment/create。
  const placeholderIcons = [
    { icon: MapPin, label: '位置' },
    { icon: TagIcon, label: '标签' },
    { icon: Paperclip, label: '添加文件' },
  ]

  return (
    <div className="rounded-xl border bg-card">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="记录此刻的心情…"
        rows={1}
        aria-label="快速新建闪记"
        className="w-full resize-none rounded-t-xl bg-transparent p-3 focus:outline-none"
      />
      <div className="flex items-center gap-1 px-2 py-1">
        <div className="flex flex-1 items-center gap-0.5">
          {placeholderIcons.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              disabled
              aria-label={label}
              title="本版暂未开放，可点展开进入完整编辑页"
              className="cursor-not-allowed rounded-md p-2 text-muted-foreground/40"
            >
              <Icon size={18} strokeWidth={1.8} />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="进入完整编辑页"
            title="进入完整编辑页"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/moment/create')}
          >
            <Expand size={18} strokeWidth={1.8} />
          </Button>
        </div>
        <Button
          type="button"
          size="icon"
          className="cursor-pointer"
          aria-label="发送闪记"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  )
}
