import { Square } from 'lucide-react'
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
    <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
      <input
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
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
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!text.trim()}
          onClick={submit}
        >
          发送
        </button>
      )}
    </div>
  )
}
