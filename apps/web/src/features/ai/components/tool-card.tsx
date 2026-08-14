import { useState } from 'react'
import type { ToolCardState } from '@/features/ai/store/ai-store'

export function ToolCard({ card }: { card: ToolCardState }) {
  const [open, setOpen] = useState(false)
  const stateText = card.running ? '运行中' : card.isError ? '出错' : '完成'
  return (
    <div className="mt-2 rounded-md border border-border bg-card text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-mono text-primary">⚙</span>
        <span className="font-mono text-primary">{card.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{stateText}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs">
          <pre className="whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(card.args, null, 2)}
          </pre>
          {card.result && <pre className="mt-2 whitespace-pre-wrap">{card.result}</pre>}
        </div>
      )}
    </div>
  )
}
