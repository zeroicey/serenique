import { Send, Square } from 'lucide-react'
import { useState } from 'react'
import { useAiStore } from '@/features/ai/store/ai-store'

// 输入区：一个输入框 + 一个按钮。
// - 空闲：按钮「发送」，Enter 发送（Shift+Enter 换行，IME 组合键不触发）。
// - AI 回复中：输入框禁用（不打断、不排队，一条对一条），按钮变停止图标，点击中止。
export function Composer() {
  const busy = useAiStore((s) => s.busy)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const [text, setText] = useState('')

  function submit() {
    if (busy || !text.trim()) return
    send(text.trim())
    setText('')
  }

  return (
    // 浮动输入条：absolute 吸附底部，圆角 + 阴影 + 半透明背景形成悬浮感；
    // 与消息区同宽居中（max-w-[600px]）：大屏两侧留白，小屏自动全宽。
    <div className="absolute inset-x-0 bottom-0 z-10 p-4">
      <div className="mx-auto flex w-full max-w-[600px] items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur">
      <input
        className="h-9 flex-1 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
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
