import { useState } from 'react'

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-1 text-sm">
      <button
        type="button"
        className="text-muted-foreground text-xs hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '收起思考' : '展开思考'}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 text-muted-foreground text-xs">
          {text}
        </div>
      )}
    </div>
  )
}
