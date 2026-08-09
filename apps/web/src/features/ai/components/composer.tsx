import { useState } from 'react'
import { useAiStore } from '@/features/ai/store/ai-store'

export function Composer() {
  const busy = useAiStore((s) => s.busy)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const [text, setText] = useState('')

  function submit() {
    if (!text.trim()) return
    send(text.trim())
    setText('')
  }

  return (
    <div className="flex shrink-0 gap-2 border-t border-border p-3">
      <textarea
        className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        rows={2}
        value={text}
        placeholder={busy ? 'agent 运行中…（输入内容可打断）' : '输入消息，Enter 发送（Shift+Enter 换行）'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
        }}
      />
      <button
        type="button"
        className="rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={submit}
      >
        发送
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 text-sm"
        onClick={() => send(text.trim())}
        disabled={!busy || !text.trim()}
      >
        打断
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 text-sm text-destructive"
        onClick={abort}
        disabled={!busy}
      >
        停止
      </button>
    </div>
  )
}
