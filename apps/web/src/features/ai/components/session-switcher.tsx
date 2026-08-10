import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAiStore } from '@/features/ai/store/ai-store'

// 会话切换：header 右侧浮动下拉。当前会话名触发，列表含新建 + 会话项（当前项高亮，
// 删除按钮 hover 显示，confirm 后删除）。替代旧的页面内 240px 侧边栏。
export function SessionSwitcher() {
  const sessions = useAiStore((s) => s.sessions)
  const currentSessionId = useAiStore((s) => s.currentSessionId)
  const newSession = useAiStore((s) => s.newSession)
  const switchSession = useAiStore((s) => s.switchSession)
  const deleteSession = useAiStore((s) => s.deleteSession)
  const [open, setOpen] = useState(false)

  const currentName =
    sessions.find((s) => s.id === currentSessionId)?.name ?? '新会话'

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="max-w-48" />}
      >
        <span className="truncate">{currentName}</span>
        <span className="text-muted-foreground">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => {
            newSession()
            setOpen(false)
          }}
        >
          <Plus className="h-4 w-4" />
          新建会话
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sessions.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            暂无会话
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="group relative flex items-center"
          >
            <DropdownMenuItem
              className={`flex-1 pr-7 ${s.id === currentSessionId ? 'bg-primary/10' : ''}`}
              onClick={() => {
                if (s.id !== currentSessionId) switchSession(s.id)
                setOpen(false)
              }}
            >
              <span className="truncate">{s.name}</span>
            </DropdownMenuItem>
            <button
              type="button"
              title="删除会话"
              aria-label={`删除会话 ${s.name}`}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`删除会话「${s.name}」？此操作不可恢复。`)) {
                  deleteSession(s.id)
                  setOpen(false)
                }
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
