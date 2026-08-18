import { Send, Square } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAiStore } from '@/features/ai/store/ai-store'

// 输入区：一个输入框 + 一个按钮。
// - 空闲：按钮「发送」，Enter 发送（Shift+Enter 换行，IME 组合键不触发）。
// - AI 回复中：输入框禁用（不打断、不排队，一条对一条），按钮变停止图标，点击中止。
// - 斜杠命令（对齐 Hermes / 需求 §3.2）：/new /compact 拦截转 WS（不进模型）；
//   未知 `/xxx` 本地 toast 提示且不发送（留输入让用户改）。
export function Composer() {
  const busy = useAiStore((s) => s.busy)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const newSession = useAiStore((s) => s.newSession)
  const compactSession = useAiStore((s) => s.compact)
  const [text, setText] = useState('')

  function submit() {
    if (busy) return
    const t = text.trim()
    if (!t) return
    if (t === '/new') {
      newSession()
      setText('')
      return
    }
    if (t === '/compact') {
      compactSession()
      setText('')
      return
    }
    if (t.startsWith('/')) {
      toast.error('未知命令')
      return // 保留输入，用户可删改
    }
    send(t)
    setText('')
  }

  return (
    // 输入区与消息区同宽居中（max-w-[600px]）：大屏两侧留白，小屏自动全宽。
    // 无背景、无分界线；输入框胶囊形（rounded-full）呈现悬浮感。
    <div className="shrink-0 p-3">
      <div className="mx-auto flex w-full max-w-[600px] items-center gap-2">
        <input
          className="h-9 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary disabled:opacity-60"
          type="text"
          value={text}
          disabled={busy}
          placeholder={busy ? 'AI 正在回复…' : '输入消息，Enter 发送'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // isComposing 守卫：中文输入法下按 Enter 确认候选词不触发发送（IME 冲突）
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            aria-label="停止"
            title="停止 AI 回复"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            onClick={abort}
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="发送"
            title="发送"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            disabled={!text.trim()}
            onClick={submit}
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
